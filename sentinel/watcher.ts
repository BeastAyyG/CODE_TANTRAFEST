/**
 * AegisDAO Sentinel watcher.
 *
 * Polls ProposalQueued, validates the registered execution bundle against the
 * queued commitment, decodes calldata, runs the bytecode scan + sandboxed
 * simulation, writes a Violation Report, and — only on a violation — asks the
 * guardian key to halt. It never executes or edits a proposal.
 *
 * Run with: npm run sentinel:watch
 */

import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { ethers } from "hardhat";
import type {
  Contract,
  ContractRunner,
  EventLog,
  InterfaceAbi,
  Signer,
} from "ethers";
import {
  computeCommitmentWithActions,
  hashRules,
} from "../packages/shared/hash";
import { decodeAction } from "./decode";
import { buildViolationReport, hashViolationReport } from "./report";
import { simulateProposalExecution } from "./simulate";
import { haltProposal } from "./halt";
import {
  appendSentinelEvent,
  bundleToActions,
  bundleToRules,
  getExecutionBundle,
  liveReportsFile,
  readLiveReports,
  repositoryRoot,
  writeLiveReports,
  type ExecutionBundle,
  type LiveReports,
  type SentinelEvent,
  type SentinelPhase,
  type SentinelResult,
  type SentinelSimulationSummary,
} from "./live-store";

const POLL_INTERVAL_MS = Number(process.env.SENTINEL_POLL_MS ?? 1000);
const HEARTBEAT_MS = 4000;
const BUNDLE_WAIT_ATTEMPTS = 10;
const BUNDLE_WAIT_MS = 300;
const ZERO_ADDRESS = ethers.ZeroAddress;

let watcherLock: string | null = null;

function acquireWatcherLock(): void {
  const file = path.join(
    repositoryRoot(),
    "packages",
    "shared",
    "fixtures",
    "sentinel-watcher.lock"
  );
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      fs.writeFileSync(
        file,
        JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
        { encoding: "utf8", flag: "wx" }
      );
      watcherLock = file;
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      let owner: number | null = null;
      try {
        owner = Number(JSON.parse(fs.readFileSync(file, "utf8")).pid) || null;
      } catch {
        // Corrupt or partially written lock: treat it as stale.
      }
      if (owner && processAlive(owner)) {
        throw new Error(
          `Another Sentinel watcher is already running (pid ${owner}). ` +
            `Stop it before starting a second instance.`
        );
      }
      fs.rmSync(file, { force: true });
    }
  }
  throw new Error("Could not acquire the Sentinel watcher lock.");
}

function releaseWatcherLock(): void {
  if (!watcherLock) return;
  try {
    const contents = JSON.parse(fs.readFileSync(watcherLock, "utf8")) as { pid?: number };
    if (contents.pid === process.pid) fs.rmSync(watcherLock, { force: true });
  } catch {
    // Best effort.
  }
  watcherLock = null;
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

interface Contracts {
  executor: Contract;
  governor: Contract;
  monitored: {
    treasuryProxy: string;
    feeModule: string;
    executor: string;
    usdc: string;
    vulnerableProxy: string;
  };
  labels: Record<string, string>;
}

interface ManifestContract {
  address: string;
  abi: InterfaceAbi;
}

interface Runtime {
  reports: LiveReports;
  contracts: Contracts;
  monitorAccounts: string[];
  simulator: Signer;
  guardian: Signer;
  chainId: bigint;
  executorAddress: string;
  rpcUrl: string;
  lastBlock: number | null;
  lastHeartbeatWrite: number;
}

function loadDeployment(): Record<string, ManifestContract> {
  const file = path.join(repositoryRoot(), "deployments", "local.json");
  if (!fs.existsSync(file)) {
    throw new Error(`Deployment manifest not found at ${file}. Run npm run deploy first.`);
  }
  const manifest = JSON.parse(fs.readFileSync(file, "utf8")) as {
    contracts?: Record<string, ManifestContract>;
  };
  if (!manifest.contracts || !manifest.contracts.IntentLockExecutor) {
    throw new Error(`Invalid deployment manifest at ${file}`);
  }
  return manifest.contracts;
}

function contract(
  contracts: Record<string, ManifestContract>,
  name: string,
  runner: ContractRunner
): Contract {
  const entry = contracts[name];
  if (!entry?.address || !entry.abi) {
    throw new Error(`Contract ${name} missing from deployments/local.json`);
  }
  return new ethers.Contract(entry.address, entry.abi, runner);
}

function labelsFor(contracts: Record<string, ManifestContract>): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const [name, entry] of Object.entries(contracts)) {
    if (entry.address) labels[entry.address.toLowerCase()] = name;
  }
  return labels;
}

async function buildRuntime(): Promise<Runtime> {
  const deployment = loadDeployment();
  const provider = ethers.provider;
  const signers = await ethers.getSigners();
  const simulator = signers[0];
  if (!simulator) throw new Error("No signer available for sandbox simulation");

  const executor = contract(deployment, "IntentLockExecutor", provider);
  const governor = contract(deployment, "IntentGovernor", provider);
  const guardianAddress = String(await executor.guardian());
  const guardian = signers.find(
    (signer) => signer.address.toLowerCase() === guardianAddress.toLowerCase()
  );
  if (!guardian) {
    throw new Error(
      `Guardian ${guardianAddress} is not one of the unlocked Hardhat signers. ` +
        `The watcher needs the guardian key to halt.`
    );
  }

  const treasuryProxy = String(deployment.TreasuryProxy?.address ?? ZERO_ADDRESS);
  const feeModule = String(deployment.FeeModule?.address ?? ZERO_ADDRESS);
  const usdc = String(deployment.MockUSDC?.address ?? ZERO_ADDRESS);
  const vulnerableProxy = String(deployment.VulnerableProxy?.address ?? ZERO_ADDRESS);
  const executorAddress = await executor.getAddress();
  const network = await provider.getNetwork();
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545";

  const reports = readLiveReports();
  reports.watcher = {
    status: "running",
    pid: process.pid,
    startedAt: new Date().toISOString(),
    lastHeartbeat: new Date().toISOString(),
    lastBlock: null,
    rpcUrl,
    executor: executorAddress,
    guardian: guardianAddress,
    pollIntervalMs: POLL_INTERVAL_MS,
  };
  writeLiveReports(reports);

  return {
    reports,
    contracts: {
      executor,
      governor,
      monitored: {
        treasuryProxy,
        feeModule,
        executor: executorAddress,
        usdc,
        vulnerableProxy,
      },
      labels: labelsFor(deployment),
    },
    monitorAccounts: signers.map((signer) => signer.address),
    simulator,
    guardian,
    chainId: network.chainId,
    executorAddress,
    rpcUrl,
    lastBlock: null,
    lastHeartbeatWrite: 0,
  };
}

function emit(
  runtime: Runtime,
  phase: SentinelPhase,
  input: {
    event: EventLog;
    proposalId: string;
    govId: string | null;
    commitment: string;
    title: string;
    detail: string;
    reportHash?: string;
    haltTxHash?: string;
    haltBlockNumber?: number;
    report?: SentinelEvent["report"];
    simulation?: SentinelSimulationSummary;
    resultStatus?: SentinelResult["status"];
  }
): void {
  const at = new Date().toISOString();
  const event: SentinelEvent = {
    id: randomUUID(),
    at,
    phase,
    proposalId: input.proposalId,
    govId: input.govId,
    commitment: input.commitment,
    title: input.title,
    blockNumber: input.event.blockNumber ?? null,
    txHash: input.event.transactionHash ?? null,
    detail: input.detail,
    reportHash: input.reportHash,
    haltTxHash: input.haltTxHash,
    haltBlockNumber: input.haltBlockNumber,
    report: input.report,
    simulation: input.simulation,
  };

  const resultStatus = input.resultStatus ?? runtime.reports.results[input.commitment.toLowerCase()]?.status ?? "OBSERVED";
  const result: SentinelResult = {
    proposalId: input.proposalId,
    govId: input.govId,
    commitment: input.commitment,
    title: input.title,
    status: resultStatus,
    updatedAt: at,
    reason: input.detail,
    reportHash: input.reportHash,
    haltTxHash: input.haltTxHash,
    haltBlockNumber: input.haltBlockNumber,
    report: input.report,
    simulation: input.simulation,
  };

  appendSentinelEvent(runtime.reports, event, result);
  writeLiveReports(runtime.reports);
  console.log(
    `[sentinel ${at.slice(11, 19)}] ${phase.padEnd(10)} proposal=${input.proposalId} ` +
      `commitment=${short(input.commitment)} ${input.detail}`
  );
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function findBundle(commitment: string): Promise<ExecutionBundle | null> {
  for (let attempt = 0; attempt < BUNDLE_WAIT_ATTEMPTS; attempt++) {
    const bundle = getExecutionBundle(commitment);
    if (bundle) return bundle;
    if (attempt < BUNDLE_WAIT_ATTEMPTS - 1) await delay(BUNDLE_WAIT_MS);
  }
  return null;
}

async function resolveGovId(governor: Contract, commitment: string): Promise<string | null> {
  try {
    const govId: bigint = await governor.commitmentToGovId(commitment);
    return govId > 0n ? govId.toString() : null;
  } catch {
    return null;
  }
}

async function processQueue(runtime: Runtime, event: EventLog): Promise<void> {
  const commitment = String(event.args.commitment);
  const proposalId = BigInt(event.args.proposalId).toString();
  const govId = await resolveGovId(runtime.contracts.governor, commitment);
  const queued = await runtime.contracts.executor.getProposal(commitment);
  const bundle = await findBundle(commitment);
  const title = bundle?.title ?? `Proposal #${proposalId}`;

  emit(runtime, "QUEUED", {
    event,
    proposalId,
    govId,
    commitment,
    title,
    detail:
      `ProposalQueued observed at block ${event.blockNumber}. ` +
      `Guardian ${short(await runtime.guardian.getAddress())} armed in halt-only mode.`,
    resultStatus: "OBSERVED",
  });

  if (Number(queued.state) !== 1) {
    emit(runtime, "ERROR", {
      event,
      proposalId,
      govId,
      commitment,
      title,
      detail: `Queued event observed, but executor state is ${Number(queued.state)}; refusing to simulate.`,
      resultStatus: "ERROR",
    });
    return;
  }

  if (!bundle) {
    emit(runtime, "ERROR", {
      event,
      proposalId,
      govId,
      commitment,
      title,
      detail:
        `No execution bundle registered for this commitment. The executor stores only hashes, ` +
        `so there is no calldata to decode.`,
      resultStatus: "ERROR",
    });
    return;
  }

  const actions = bundleToActions(bundle);
  const rules = bundleToRules(bundle);

  if (
    BigInt(bundle.proposalId) !== queued.proposalId ||
    BigInt(bundle.version) !== queued.version ||
    bundle.versionHash.toLowerCase() !== String(queued.versionHash).toLowerCase() ||
    bundle.disclosureHash.toLowerCase() !== String(queued.disclosureHash).toLowerCase()
  ) {
    emit(runtime, "ERROR", {
      event,
      proposalId,
      govId,
      commitment,
      title,
      detail: "Execution bundle metadata does not match the queued proposal.",
      resultStatus: "ERROR",
    });
    return;
  }

  let computedCommitment = "";
  try {
    computedCommitment = computeCommitmentWithActions(
      runtime.chainId,
      runtime.executorAddress,
      queued.proposalId,
      queued.version,
      queued.versionHash,
      actions,
      hashRules(rules),
      queued.disclosureHash
    ).commitment;
  } catch (err) {
    emit(runtime, "ERROR", {
      event,
      proposalId,
      govId,
      commitment,
      title,
      detail: `Could not hash the execution bundle: ${errorMessage(err)}`,
      resultStatus: "ERROR",
    });
    return;
  }

  if (computedCommitment.toLowerCase() !== commitment.toLowerCase()) {
    emit(runtime, "ERROR", {
      event,
      proposalId,
      govId,
      commitment,
      title,
      detail:
        `Execution bundle hash ${short(computedCommitment)} does not match the queued ` +
        `commitment ${short(commitment)}. Refusing to simulate unverified calldata.`,
      resultStatus: "ERROR",
    });
    return;
  }

  const decoded = actions.map((action) => decodeAction(action, undefined, runtime.contracts.labels));
  emit(runtime, "DECODING", {
    event,
    proposalId,
    govId,
    commitment,
    title,
    detail:
      `Commitment verified. Decoded ${decoded.length} action(s): ` +
      decoded.map((action) => action.humanText).join(" | "),
    resultStatus: "OBSERVED",
  });

  emit(runtime, "SIMULATING", {
    event,
    proposalId,
    govId,
    commitment,
    title,
    detail:
      "Snapshot opened; executing the verified payload against committed rules, tracing effects, " +
      "then reverting the sandbox. The live proposal is not executed.",
    resultStatus: "OBSERVED",
  });

  try {
    const simulation = await simulateProposalExecution(
      runtime.contracts.executor,
      queued.proposalId,
      queued.version,
      queued.versionHash,
      queued.disclosureHash,
      actions,
      rules,
      runtime.contracts.monitored,
      runtime.monitorAccounts,
      { signer: runtime.simulator, warpToEta: true }
    );

    const report = buildViolationReport(simulation, {
      proposalId,
      scenarioId: `live-P${proposalId}`,
      proposalSaid: bundle.title,
      targetLabels: runtime.contracts.labels,
      layer: "sentinel",
      persist: false,
    });
    const reportHash = hashViolationReport(report);
    const summary = simulationSummary(simulation);

    if (!simulation.shouldHalt) {
      emit(runtime, "CLEAN", {
        event,
        proposalId,
        govId,
        commitment,
        title,
        detail:
          "Simulation passed every static, rule, state-diff, and trace invariant. " +
          "Sandbox reverted; no halt submitted.",
        reportHash,
        report,
        simulation: summary,
        resultStatus: "CLEAN",
      });
      return;
    }

    emit(runtime, "VIOLATION", {
      event,
      proposalId,
      govId,
      commitment,
      title,
      detail: report.violatedConstraint.message,
      reportHash,
      report,
      simulation: summary,
      resultStatus: "OBSERVED",
    });

    console.log("");
    console.log("SENTINEL GUARDIAN HALT REQUESTED");
    console.log(`  Proposal:    #${proposalId}${govId ? ` (govId ${govId})` : ""}`);
    console.log(`  Commitment:  ${commitment}`);
    console.log(`  Report hash: ${reportHash}`);
    console.log(`  Violation:   ${report.violatedConstraint.code}`);
    console.log("  Authority:   halt-only. The Sentinel never executes or edits the proposal.");
    console.log("");

    const halt = await haltProposal(
      runtime.contracts.executor,
      runtime.guardian,
      commitment,
      report
    );
    const haltedState = Number(await runtime.contracts.executor.getState(commitment));

    emit(runtime, "HALTED", {
      event,
      proposalId,
      govId,
      commitment,
      title,
      detail:
        `Guardian halt confirmed in block ${halt.blockNumber}; executor state ${haltedState} (Halted). ` +
        `Simulation detected the violation; the proposal was not executed.`,
      reportHash: halt.reportHash,
      haltTxHash: halt.txHash,
      haltBlockNumber: halt.blockNumber,
      report,
      simulation: summary,
      resultStatus: "HALTED",
    });
    console.log("");
  } catch (err) {
    emit(runtime, "ERROR", {
      event,
      proposalId,
      govId,
      commitment,
      title,
      detail: `Sentinel processing failed: ${errorMessage(err)}`,
      resultStatus: "ERROR",
    });
  }
}

function simulationSummary(simulation: {
  success: boolean;
  reverted: boolean;
  revertReason?: string;
  staticScans?: { violations: string[] }[];
  diffReport: {
    summary: string;
    violations: { category: string }[];
  };
  trace?: {
    source: string;
    calls: unknown[];
    delegateCalls: unknown[];
    tokenTransfers: unknown[];
  };
}): SentinelSimulationSummary {
  const staticViolations = (simulation.staticScans ?? []).flatMap(
    (scan) => scan.violations
  );
  return {
    success: simulation.success,
    reverted: simulation.reverted,
    revertReason: simulation.revertReason,
    staticViolations,
    diffSummary: simulation.diffReport.summary,
    violationCount:
      staticViolations.length + simulation.diffReport.violations.length,
    categories: [
      ...new Set(simulation.diffReport.violations.map((violation) => violation.category)),
    ],
    traceSource: simulation.trace?.source,
    callCount: simulation.trace?.calls.length,
    delegateCallCount: simulation.trace?.delegateCalls.length,
    tokenTransferCount: simulation.trace?.tokenTransfers.length,
  };
}

function short(value: string): string {
  return value.length > 18 ? `${value.slice(0, 10)}…${value.slice(-6)}` : value;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    const details = error as Error & { shortMessage?: string };
    return details.shortMessage ?? details.message;
  }
  return String(error);
}

async function heartbeat(runtime: Runtime, force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - runtime.lastHeartbeatWrite < HEARTBEAT_MS) return;
  runtime.lastHeartbeatWrite = now;
  if (runtime.reports.watcher) {
    runtime.reports.watcher.lastHeartbeat = new Date().toISOString();
    runtime.reports.watcher.lastBlock = runtime.lastBlock;
  }
  writeLiveReports(runtime.reports);
}

function stop(runtime: Runtime): void {
  try {
    if (runtime.reports.watcher) {
      runtime.reports.watcher.status = "stopped";
      runtime.reports.watcher.lastHeartbeat = new Date().toISOString();
    }
    writeLiveReports(runtime.reports);
    console.log(`\nSentinel watcher stopped. Results: ${liveReportsFile()}`);
  } catch (err) {
    console.error(`Failed to persist watcher shutdown: ${errorMessage(err)}`);
  } finally {
    releaseWatcherLock();
  }
}

async function main(): Promise<void> {
  acquireWatcherLock();
  const runtime = await buildRuntime();
  const provider = ethers.provider;
  const fromBlockEnv = Number(process.env.SENTINEL_FROM_BLOCK);
  const currentBlock = await provider.getBlockNumber();
  let nextBlock = Number.isFinite(fromBlockEnv) && fromBlockEnv >= 0
    ? fromBlockEnv
    : currentBlock;

  runtime.lastBlock = currentBlock;
  await heartbeat(runtime, true);

  let stopping = false;
  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`\n[${signal}] Sentinel watcher shutting down.`);
    stop(runtime);
    process.exit(0);
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));

  console.log("AEGIS SENTINEL WATCHER");
  console.log(`  RPC:        ${runtime.rpcUrl}`);
  console.log(`  Executor:   ${runtime.executorAddress}`);
  console.log(`  Chain:      ${runtime.chainId}`);
  console.log(`  Guardian:   ${await runtime.guardian.getAddress()} (halt-only)`);
  console.log(`  Watch from: block ${nextBlock}`);
  console.log(`  Results:    ${liveReportsFile()}`);
  console.log("  Waiting for ProposalQueued events...\n");

  while (!stopping) {
    try {
      const latest = await provider.getBlockNumber();
      if (latest < nextBlock) {
        nextBlock = latest;
      }

      if (latest >= nextBlock) {
        const queuedEvents = await runtime.contracts.executor.queryFilter(
          runtime.contracts.executor.filters.ProposalQueued(),
          nextBlock,
          latest
        );
        // Advance before processing: a persistence hiccup must not replay a
        // queue event and submit a second halt.
        nextBlock = latest + 1;
        for (const event of queuedEvents) {
          if ("args" in event) {
            await processQueue(runtime, event as EventLog);
          }
          await heartbeat(runtime, true);
        }
      }

      runtime.lastBlock = latest;
      await heartbeat(runtime);
    } catch (err) {
      console.error(`[sentinel] Watcher poll failed: ${errorMessage(err)}`);
    }
    await delay(POLL_INTERVAL_MS);
  }
}

main().catch((error) => {
  console.error(error);
  try {
    const reports = readLiveReports();
    if (reports.watcher) {
      reports.watcher.status = "stopped";
      writeLiveReports(reports);
    }
  } catch {
    // Best effort only.
  }
  releaseWatcherLock();
  process.exitCode = 1;
});
