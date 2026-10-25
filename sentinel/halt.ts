import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import {
  Action,
  ActionKind,
  ActionRule,
  hashActions,
} from "../packages/shared/hash";
import errorMap from "../packages/shared/errors.json";
import { SimulationResult } from "./simulate";

export interface DecodedAction {
  target: string;
  targetLabel: string;
  function: string;
  args: Record<string, string>;
  humanText: string;
  nested: DecodedAction[];
}

export interface ViolationReport {
  proposalId: string;
  scenarioId: string;
  layer: "executor" | "sentinel";
  status: "REJECTED" | "FLAGGED" | "PASSED";
  proposalSaid: string;
  approved: DecodedAction[];
  submitted: DecodedAction[];
  violatedConstraint: { code: string; message: string };
  evidence: {
    commitment: string;
    calldataHash: string;
    calldata: string;
    revertData: string;
    txHash: string | null;
    traceRef: string | null;
  };
}

export interface ReportMeta {
  proposalId?: string;
  scenarioId?: string;
  proposalSaid?: string;
  approved?: DecodedAction[];
  submitted?: DecodedAction[];
  targetLabels?: Record<string, string>;
  traceRef?: string | null;
  status?: "REJECTED" | "FLAGGED" | "PASSED";
  /** Persist the report + trace evidence under packages/shared/fixtures/reports/. */
  persist?: boolean;
}

export interface HaltReceipt {
  commitment: string;
  reportHash: string;
  txHash: string;
  blockNumber: number;
  report: ViolationReport;
}

const DECODE_IFACE = new ethers.Interface([
  "function transfer(address to, uint256 amount)",
  "function approve(address spender, uint256 amount)",
  "function upgradeTo(address newImplementation)",
  "function upgradeToAndCall(address newImplementation, bytes data)",
  "function transferOwnership(address newOwner)",
  "function multicall(bytes[] data)",
  "function setFee(uint256 newFee)",
  "function withdrawERC20(address token, address to, uint256 amount)",
  "function backdoorDrain(address token)",
  "function executeArbitrary(address target, bytes data)",
]);

const MULTICALL_SELECTOR = "0xac9650d8";

const VIOLATION_CODES: Record<string, string> = {
  UPGRADE: "UnauthorizedUpgrade",
  OWNERSHIP: "UnauthorizedOwnershipTransfer",
  ALLOWANCE: "UnauthorizedAllowance",
  BALANCE: "UnauthorizedBalanceChange",
  TRANSFER: "UnauthorizedRecipient",
  DELEGATECALL: "UnauthorizedDelegateCall",
  CODEHASH: "CodeHashMismatch",
  STORAGE: "UnauthorizedStorageChange",
  RULE_MISMATCH: "RuleMismatch",
};

/**
 * Assemble the frozen Violation Report schema (c) from simulation evidence.
 */
export function buildViolationReport(
  simulation: SimulationResult,
  meta: ReportMeta = {}
): ViolationReport {
  const labels = meta.targetLabels ?? {};
  const traceRef =
    meta.traceRef !== undefined
      ? meta.traceRef
      : meta.persist && simulation.commitment
        ? `packages/shared/fixtures/reports/${simulation.commitment}.json`
        : null;

  return {
    proposalId: meta.proposalId ?? simulation.proposalId.toString(),
    scenarioId: meta.scenarioId ?? "sentinel",
    layer: "sentinel",
    status: meta.status ?? (simulation.shouldHalt ? "FLAGGED" : "PASSED"),
    proposalSaid: meta.proposalSaid ?? describeRules(simulation.rules, labels),
    approved: meta.approved ?? simulation.rules.map((r) => decodeRule(r, labels)),
    submitted:
      meta.submitted ?? simulation.actions.map((a) => decodeAction(a, labels)),
    violatedConstraint: simulation.shouldHalt
      ? {
          code: violationCode(simulation),
          message: simulation.haltReason ?? "Sentinel detected a violation",
        }
      : { code: "None", message: "No violation detected" },
    evidence: {
      commitment: simulation.commitment,
      calldataHash: calldataHash(simulation.actions),
      calldata: simulation.actions[0]?.data ?? "0x",
      revertData: simulation.revertData ?? "0x",
      txHash: simulation.txHash ?? null,
      traceRef,
    },
  };
}

/**
 * Guardian intervention: halt a queued proposal after the Sentinel detected
 * a violation. The guardian can only halt — never execute or substitute.
 */
export async function haltProposal(
  executor: any,
  guardianSigner: any,
  commitment: string,
  reportOrSimulation: ViolationReport | SimulationResult,
  meta: ReportMeta = {}
): Promise<HaltReceipt> {
  const simulation = isSimulation(reportOrSimulation)
    ? reportOrSimulation
    : undefined;
  const report = simulation
    ? buildViolationReport(simulation, meta)
    : (reportOrSimulation as ViolationReport);

  if (!report.evidence.commitment) {
    report.evidence.commitment = commitment;
  }

  const reportHash = ethers.keccak256(
    ethers.toUtf8Bytes(stableStringify(report))
  );

  if (meta.persist) {
    persistEvidence(report, simulation);
  }

  console.log(`SENTINEL GUARDIAN HALT`);
  console.log(`  Commitment:  ${commitment}`);
  console.log(`  Report hash: ${reportHash}`);
  console.log(`  Constraint:  ${report.violatedConstraint.code}`);

  const tx = await executor.connect(guardianSigner).halt(commitment, reportHash);
  const receipt = await tx.wait();
  if (!receipt) {
    throw new Error("Halt transaction was not mined");
  }

  console.log(
    `  Proposal halted in block ${receipt.blockNumber} (tx: ${receipt.hash})`
  );

  return {
    commitment,
    reportHash,
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    report,
  };
}

export function hashViolationReport(report: ViolationReport): string {
  return ethers.keccak256(ethers.toUtf8Bytes(stableStringify(report)));
}

function isSimulation(
  value: ViolationReport | SimulationResult
): value is SimulationResult {
  return (
    typeof value === "object" &&
    value !== null &&
    "diffReport" in value &&
    "shouldHalt" in value
  );
}

function violationCode(simulation: SimulationResult): string {
  const staticHalt =
    simulation.staticScan && simulation.staticScan.violations.length > 0;
  if (staticHalt) return "DangerousBytecode";

  const selector = simulation.revertData?.slice(0, 10).toLowerCase();
  if (selector && selector.length === 10 && selector !== "0x") {
    const known = (errorMap as Record<string, { signature?: string }>)[selector];
    if (known?.signature) {
      return known.signature.split("(")[0];
    }
  }

  if (simulation.commitmentMismatch) return "CommitmentMismatch";

  const category = simulation.diffReport.violations[0]?.category;
  if (category) return VIOLATION_CODES[category] ?? "SentinelViolation";

  if (simulation.reverted) return "ExecutionReverted";
  return "None";
}

function calldataHash(actions: Action[]): string {
  if (actions.length === 0) return ethers.ZeroHash;
  if (actions.length === 1) return ethers.keccak256(actions[0].data);
  return hashActions(actions);
}

function describeRules(rules: ActionRule[], labels: Record<string, string>): string {
  if (rules.length === 0) return "No approved intent rules";
  return rules.map((r) => decodeRule(r, labels).humanText).join("; ");
}

function decodeRule(rule: ActionRule, labels: Record<string, string>): DecodedAction {
  const kind =
    typeof rule.kind === "number" && ActionKind[rule.kind] !== undefined
      ? ActionKind[rule.kind]
      : String(rule.kind);
  const targetLabel = labelFor(rule.target, labels);
  const counterpartyLabel = labelFor(rule.counterparty, labels);

  const args: Record<string, string> = {
    target: rule.target,
    selector: rule.selector,
    counterparty: rule.counterparty,
    maxAmount: rule.maxAmount.toString(),
    codeHash: rule.codeHash,
    childCount: String(rule.childCount),
  };

  let humanText: string;
  switch (rule.kind) {
    case ActionKind.ERC20_TRANSFER:
      humanText = `Transfer up to ${rule.maxAmount} from ${targetLabel} to ${counterpartyLabel}`;
      break;
    case ActionKind.ERC20_APPROVE:
      humanText = `Approve up to ${rule.maxAmount} from ${targetLabel} for ${counterpartyLabel}`;
      break;
    case ActionKind.PARAM_SET:
      humanText = `Call ${rule.selector} on ${targetLabel} (max value ${rule.maxAmount})`;
      break;
    case ActionKind.UPGRADE:
      humanText = `Upgrade ${targetLabel} to ${counterpartyLabel}${
        rule.codeHash === ethers.ZeroHash ? " (no code hash committed)" : ""
      }`;
      break;
    case ActionKind.OWNERSHIP_TRANSFER:
      humanText = `Transfer ownership of ${targetLabel} to ${counterpartyLabel}`;
      break;
    case ActionKind.MULTICALL:
      humanText = `Multicall with ${rule.childCount} inner call(s) on ${targetLabel}`;
      break;
    default:
      humanText = `Rule ${kind} on ${targetLabel}`;
  }

  return {
    target: rule.target,
    targetLabel,
    function: kind,
    args,
    humanText,
    nested: [],
  };
}

function decodeAction(action: Action, labels: Record<string, string>, depth = 0): DecodedAction {
  const targetLabel = labelFor(action.target, labels);
  const selector = action.data?.slice(0, 10).toLowerCase() ?? "0x";

  let parsed: ethers.TransactionDescription | null = null;
  try {
    parsed = DECODE_IFACE.parseTransaction({ data: action.data });
  } catch {}

  if (!parsed) {
    return {
      target: action.target,
      targetLabel,
      function: selector,
      args: {},
      humanText: `Raw call ${selector} to ${targetLabel}`,
      nested: [],
    };
  }

  const args: Record<string, string> = {};
  parsed.fragment.inputs.forEach((input, index) => {
    args[input.name || `arg${index}`] = formatArg(parsed!.args[index]);
  });

  const signature = `${parsed.fragment.name}(${parsed.fragment.inputs
    .map((i) => i.type)
    .join(",")})`;

  const nested: DecodedAction[] = [];
  if (
    depth < 2 &&
    selector === MULTICALL_SELECTOR &&
    parsed.args.length > 0
  ) {
    for (const inner of parsed.args[0] as string[]) {
      nested.push(
        decodeAction(
          { target: action.target, value: 0n, data: inner },
          labels,
          depth + 1
        )
      );
    }
  }

  return {
    target: action.target,
    targetLabel,
    function: signature,
    args,
    humanText: `${signature} on ${targetLabel}${
      nested.length ? ` (${nested.length} nested call(s))` : ""
    }`,
    nested,
  };
}

function formatArg(value: unknown): string {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return `[${value.map(formatArg).join(", ")}]`;
  return String(value);
}

function labelFor(address: string, labels: Record<string, string>): string {
  if (!address) return "address(0)";
  const direct = labels[address] ?? labels[address.toLowerCase()];
  if (direct) return direct;
  return address;
}

/**
 * Deterministic JSON: sorted keys, bigint as string, stable escaping.
 * The on-chain report hash must be reproducible from the same report.
 */
export function stableStringify(value: unknown): string {
  if (value === undefined || value === null) return "null";
  if (typeof value === "bigint") return JSON.stringify(value.toString());
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    const entries = Object.keys(object)
      .sort()
      .filter((key) => object[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

function persistEvidence(
  report: ViolationReport,
  simulation: SimulationResult | undefined
): void {
  const traceRef = report.evidence.traceRef;
  if (!traceRef) return;

  try {
    const absolute = path.resolve(process.cwd(), traceRef);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    const payload = {
      report,
      simulation: simulation
        ? {
            proposalId: simulation.proposalId,
            commitment: simulation.commitment,
            commitmentMismatch: simulation.commitmentMismatch,
            success: simulation.success,
            reverted: simulation.reverted,
            revertReason: simulation.revertReason,
            revertData: simulation.revertData,
            txHash: simulation.txHash,
            shouldHalt: simulation.shouldHalt,
            haltReason: simulation.haltReason,
            staticScans: simulation.staticScans,
            diffReport: simulation.diffReport,
            trace: simulation.trace,
          }
        : undefined,
    };
    fs.writeFileSync(
      absolute,
      JSON.stringify(
        payload,
        (_key, value) => (typeof value === "bigint" ? value.toString() : value),
        2
      ),
      "utf8"
    );
  } catch {
    // Evidence persistence is best-effort; the on-chain hash is authoritative.
  }
}
