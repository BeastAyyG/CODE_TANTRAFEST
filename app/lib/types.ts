/** Shapes mirrored from the real backend fixtures and contracts. */

export type DataMode = "mock" | "live";

export interface ScorecardEntry {
  id: string;
  property: string;
  status: "PASS" | "FAIL" | "TEST_REQUIRED";
  testFile: string;
  durationMs: number;
}

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

export type ScenarioOutcome = "Success" | "Executor Revert" | "Sentinel Halt";

export interface ScenarioReport {
  scenarioId: number;
  scenarioName: string;
  property: string;
  outcome: ScenarioOutcome;
  violationReport: ViolationReport;
  rawEvidence: {
    commitment: string;
    calldata: string;
    revertData: string;
    txHash: string | null;
    trace: unknown;
  };
}

export interface ArenaRunResult {
  scenarioId: number;
  passed: boolean;
  status: "PASS" | "FAIL";
  durationMs: number;
  exitCode?: number | null;
  testFile: string;
  scorecardEntry: ScorecardEntry | null;
  report: ScenarioReport | null;
  stdout?: string;
  stderr?: string;
  error?: string;
}

export interface ErrorEntry {
  signature: string;
  contract: string;
  title: string;
  explanation: string;
}

export interface StageFactor {
  label: string;
  value: string;
  detail?: string;
}

export type StageName = "CLAIMS" | "COI" | "VOTING" | "EXECUTION";
export type StageStatus = "GREEN" | "AMBER" | "RED";

export interface Stage {
  stage: StageName;
  score: number | null;
  status: StageStatus;
  reason: string;
  factors: StageFactor[];
  drilldown: string;
}

export interface EvaluationChain {
  proposalId: string;
  stages: Stage[];
}

export interface WalletNode {
  id: string;
  label: string;
  role: string;
  disclosed: boolean;
  simulated: boolean;
}

export interface WalletEdge {
  id: string;
  from: string;
  to: string;
  type: string;
  asset: string;
  amount: string;
  timestamp: string;
  txHash: string;
  disclosed: boolean;
  simulated: boolean;
}

export interface WalletGraphData {
  simulated: boolean;
  schema: string;
  snapshotAt: string;
  disclaimer: string;
  proposalId: string;
  disclosure: { walletListHash: string; disclosedWallets: string[] };
  nodes: WalletNode[];
  edges: WalletEdge[];
}

export interface VersionEntry {
  version: number;
  versionHash: string;
  prevVersionHash: string;
  contentHash: string;
  evidenceRoot: string;
  financialAssumptionsHash: string;
  technicalAssessmentHash: string;
  intentHash: string;
  disclosureHash: string;
  timestamp: string;
  author: string;
  contentPreview: string;
}

export interface VersionChain {
  proposalId: string;
  valid: boolean;
  versions: VersionEntry[];
}

export interface VoteRecord {
  voter: string;
  support: 0 | 1 | 2;
  weight: string;
  briefHash: string | null;
  hasVoted: boolean;
}

export interface VotingState {
  govId: string;
  proposalId: string;
  state: string;
  stateCode: number;
  versionHash: string;
  version: number;
  commitment: string;
  actionsHash: string;
  intentHash: string;
  disclosureHash: string;
  voteStart: string;
  voteEnd: string;
  snapshotBlock: number;
  forVotes: string;
  againstVotes: string;
  abstainVotes: string;
  informedForVotes: string;
  totalBriefAcks: number;
  quorum: string;
  proposer: string;
  quorumReached: boolean;
  informedRatio: number;
  votes: VoteRecord[];
}

export interface IntentSource {
  docHash: string;
  page: number;
  section: string;
  span: [number, number];
}

export interface IntentAction {
  kind: string;
  target: string;
  selector: string;
  counterparty: string;
  maxAmount: string;
  codeHash: string | null;
  children: IntentAction[];
  source: IntentSource;
  confidence: number;
}

export interface UnresolvedItem {
  question: string;
  source: IntentSource | Record<string, never>;
}

export interface Assumption {
  name: string;
  value: string;
  source: IntentSource | Record<string, never>;
}

export interface IntentDraft {
  proposalId: string;
  version: number;
  title: string;
  actions: IntentAction[];
  unresolved: UnresolvedItem[];
  assumptions: Assumption[];
}

export interface Proposal {
  id: string;
  label: string;
  title: string;
  scenarioId: number;
  govId: string;
}
