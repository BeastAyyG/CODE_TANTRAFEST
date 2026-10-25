/**
 * sentinel/report.ts
 *
 * Assembles the frozen Violation Report (schema c) from Sentinel simulation
 * evidence. Decoding (humanText, targetLabel) comes from decode.ts. The
 * jargon-vs-reality gap is surfaced by pairing that decoded reality with the
 * human-readable error explanation from packages/shared/errors.json.
 */

import { ethers } from "ethers";
import errorMap from "../packages/shared/errors.json";
import { Action, ActionRule, hashActions } from "../packages/shared/hash";
import { SimulationResult } from "./simulate";
import {
  DecodedAction,
  DecoderRegistry,
  decodeAction,
  decodeRule,
  getDecoderRegistry,
} from "./decode";

export type { DecodedAction } from "./decode";

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
  layer?: "executor" | "sentinel";
  /** Persist the report + trace evidence under packages/shared/fixtures/reports/. */
  persist?: boolean;
}

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
  const registry = getDecoderRegistry();
  const labels = meta.targetLabels ?? {};

  const approved =
    meta.approved ?? simulation.rules.map((r) => decodeRule(r, registry, labels));
  const submitted =
    meta.submitted ??
    simulation.actions.map((a) => decodeAction(a, registry, labels));

  const traceRef =
    meta.traceRef !== undefined
      ? meta.traceRef
      : meta.persist && simulation.commitment
        ? `packages/shared/fixtures/reports/${simulation.commitment}.json`
        : null;

  return {
    proposalId: meta.proposalId ?? simulation.proposalId.toString(),
    scenarioId: meta.scenarioId ?? "sentinel",
    layer: meta.layer ?? "sentinel",
    status: meta.status ?? (simulation.shouldHalt ? "FLAGGED" : "PASSED"),
    proposalSaid:
      meta.proposalSaid ?? describeRules(simulation.rules, registry, labels),
    approved,
    submitted,
    violatedConstraint: buildViolatedConstraint(simulation, submitted),
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

export function hashViolationReport(report: ViolationReport): string {
  return ethers.keccak256(ethers.toUtf8Bytes(stableStringify(report)));
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

/**
 * Pair the decoded reality with the error explanation from errors.json. This
 * is the jargon-vs-reality gap: what the proposal claimed (proposalSaid)
 * versus what the calldata actually does (decoded humanText) versus why the
 * constraint fired (errors.json explanation).
 */
function buildViolatedConstraint(
  simulation: SimulationResult,
  submitted: DecodedAction[]
): { code: string; message: string } {
  if (!simulation.shouldHalt) {
    return { code: "None", message: "No violation detected" };
  }

  const code = violationCode(simulation);
  const error = lookupError(simulation.revertData);
  const reality = submitted.map((d) => d.humanText).join("; ");

  let message: string;
  if (error) {
    message = reality
      ? `${reality} — ${error.title}: ${error.explanation}`
      : `${error.title}: ${error.explanation}`;
  } else if (simulation.haltReason) {
    message = simulation.haltReason;
  } else {
    message = "Sentinel detected a violation";
  }

  return { code, message };
}

interface ErrorEntry {
  signature?: string;
  contract?: string;
  title?: string;
  explanation?: string;
}

function lookupError(revertData?: string): {
  title: string;
  explanation: string;
} | null {
  if (!revertData) return null;
  const selector = revertData.slice(0, 10).toLowerCase();
  if (!/^0x[0-9a-f]{8}$/.test(selector)) return null;
  const entry = (errorMap as Record<string, ErrorEntry>)[selector];
  if (!entry?.explanation) return null;
  return {
    title: entry.title ?? entry.signature ?? "Constraint violation",
    explanation: entry.explanation,
  };
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

function describeRules(
  rules: ActionRule[],
  registry: DecoderRegistry,
  labels: Record<string, string>
): string {
  if (rules.length === 0) return "No approved intent rules";
  return rules.map((r) => decodeRule(r, registry, labels).humanText).join("; ");
}
