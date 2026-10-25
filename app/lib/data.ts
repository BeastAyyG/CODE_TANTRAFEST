import scorecardJson from "./mocks/scorecard.json";
import reportsJson from "./mocks/sentinel-reports.json";
import errorsJson from "./mocks/errors.json";
import evaluationJson from "./mocks/evaluation-chains.json";
import walletGraphJson from "./mocks/wallet-graph.json";
import versionChainsJson from "./mocks/version-chains.json";
import votingStatesJson from "./mocks/voting-states.json";
import intentDraftJson from "./mocks/intent-draft.json";
import proposalsJson from "./mocks/proposals.json";

import { CHAIN_ID, DATA_MODE } from "./config";
import type {
  ArenaRunResult,
  ErrorEntry,
  EvaluationChain,
  IntentDraft,
  Proposal,
  ScenarioReport,
  ScorecardEntry,
  VersionChain,
  VotingState,
  WalletGraphData,
} from "./types";

export { CHAIN_ID, DATA_MODE };

export const SCENARIO_IDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const scorecardSeed = scorecardJson as ScorecardEntry[];
const reportsSeed = reportsJson as unknown as ScenarioReport[];
const errorCatalog = errorsJson as unknown as Record<string, ErrorEntry>;
const evaluationSeed = evaluationJson as unknown as EvaluationChain[];
const walletGraphSeed = walletGraphJson as unknown as WalletGraphData;
const versionChainsSeed = versionChainsJson as unknown as VersionChain[];
const votingStatesSeed = votingStatesJson as unknown as VotingState[];
const intentDraftSeed = intentDraftJson as unknown as IntentDraft;
const proposalsSeed = proposalsJson as unknown as Proposal[];

// Mock runs mutate this in-memory copy so the Scorecard updates in-session.
const mockScorecard: ScorecardEntry[] = scorecardSeed.map((entry) => ({
  ...entry,
}));

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  if (!response.ok) {
    let detail = "";
    try {
      detail = JSON.stringify(await response.json());
    } catch {
      // ignore non-JSON error bodies
    }
    throw new Error(`Request failed (${response.status}) ${detail}`.trim());
  }
  return response.json() as Promise<T>;
}

function liveUnavailable(feature: string): never {
  throw new Error(
    `${feature} has no live endpoint yet. Set NEXT_PUBLIC_DATA_MODE=mock to use the fixtures.`
  );
}

export async function getProposals(): Promise<Proposal[]> {
  // Navigation metadata; both proposals exist in the demo dataset.
  return proposalsSeed;
}

export async function getScorecard(): Promise<ScorecardEntry[]> {
  if (DATA_MODE === "live") return fetchJson<ScorecardEntry[]>("/api/scorecard");
  await delay(120);
  return mockScorecard.map((entry) => ({ ...entry }));
}

export async function getReport(id: number): Promise<ScenarioReport> {
  if (DATA_MODE === "live") {
    return fetchJson<ScenarioReport>(`/api/reports/${id}`);
  }
  await delay(80);
  const report = reportsSeed.find((item) => item.scenarioId === id);
  if (!report) throw new Error(`No report found for scenario ${id}`);
  return report;
}

export async function getAllReports(): Promise<ScenarioReport[]> {
  if (DATA_MODE === "live") {
    return Promise.all(
      SCENARIO_IDS.map((id) => fetchJson<ScenarioReport>(`/api/reports/${id}`))
    );
  }
  await delay(100);
  return reportsSeed;
}

export async function runScenario(id: number): Promise<ArenaRunResult> {
  if (DATA_MODE === "live") {
    return fetchJson<ArenaRunResult>(`/api/arena/${id}`, { method: "POST" });
  }

  await delay(650);
  const report = reportsSeed.find((item) => item.scenarioId === id);
  if (!report) throw new Error(`Unknown scenario ${id}`);

  const propertyHolds = mockExpectationHolds(report);
  const durationMs = 240 + ((id * 83) % 560);
  const entry = updateMockScorecard(
    id,
    propertyHolds ? "PASS" : "FAIL",
    durationMs
  );

  return {
    scenarioId: id,
    passed: propertyHolds,
    status: propertyHolds ? "PASS" : "FAIL",
    durationMs,
    exitCode: propertyHolds ? 0 : 1,
    testFile: entry?.testFile ?? `test/redteam/scenario${id}`,
    scorecardEntry: entry,
    report,
    stdout: `[mock] scenario ${id} executed: ${report.outcome}`,
    stderr: "",
  };
}

export async function getEvaluationChain(
  proposalId: string
): Promise<EvaluationChain> {
  if (DATA_MODE === "live") liveUnavailable("Evaluation chain");
  await delay(80);
  const chain = evaluationSeed.find((item) => item.proposalId === proposalId);
  if (!chain) throw new Error(`No evaluation chain for proposal ${proposalId}`);
  return chain;
}

export async function getGraph(
  proposalId: string
): Promise<WalletGraphData> {
  if (DATA_MODE === "live") liveUnavailable("Wallet graph");
  await delay(80);
  return { ...walletGraphSeed, proposalId };
}

export async function getVersionChain(
  proposalId: string
): Promise<VersionChain> {
  if (DATA_MODE === "live") liveUnavailable("Version chain");
  await delay(80);
  const chain = versionChainsSeed.find(
    (item) => item.proposalId === proposalId
  );
  if (!chain) throw new Error(`No version chain for proposal ${proposalId}`);
  return chain;
}

export async function getVotingState(govId: string): Promise<VotingState> {
  if (DATA_MODE === "live") liveUnavailable("Voting state");
  await delay(80);
  const state = votingStatesSeed.find((item) => item.govId === govId);
  if (!state) throw new Error(`No voting state for govId ${govId}`);
  return state;
}

export async function getIntentDraft(
  proposalId: string
): Promise<IntentDraft> {
  if (DATA_MODE === "live") liveUnavailable("Intent draft");
  await delay(80);
  return { ...intentDraftSeed, proposalId };
}

/** Static reference catalog (errors.json); same content in both modes. */
export function getErrorCatalog(): Record<string, ErrorEntry> {
  return errorCatalog;
}

export function findErrorForReport(
  report: ScenarioReport
): ErrorEntry | null {
  const code = report.violationReport.violatedConstraint.code;
  const byName = Object.values(errorCatalog).find((entry) =>
    entry.signature.startsWith(`${code}(`)
  );
  if (byName) return byName;

  const selector = report.violationReport.evidence.revertData
    ?.slice(0, 10)
    .toLowerCase();
  if (selector && /^0x[0-9a-f]{8}$/.test(selector)) {
    return errorCatalog[selector] ?? null;
  }
  return null;
}

function mockExpectationHolds(report: ScenarioReport): boolean {
  // A Red-Team test passes when the recorded security outcome is the expected
  // one: benign executes, attacks are rejected or flagged.
  return (
    report.outcome === "Success" ||
    report.outcome === "Executor Revert" ||
    report.outcome === "Sentinel Halt"
  );
}

function updateMockScorecard(
  id: number,
  status: "PASS" | "FAIL",
  durationMs: number
): ScorecardEntry | null {
  const key = `S${id}`;
  const index = mockScorecard.findIndex((entry) => entry.id === key);
  if (index === -1) return null;
  mockScorecard[index] = { ...mockScorecard[index], status, durationMs };
  return { ...mockScorecard[index] };
}
