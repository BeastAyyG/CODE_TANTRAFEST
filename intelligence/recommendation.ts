/**
 * intelligence/recommendation.ts
 *
 * Recommendation -> plan -> execution.
 *
 * A single user's recommendation is the only input to the planner. The local
 * model turns it into a step plan plus an IntentSpec; execution then validates
 * the intent, bridges it to commitment hashes, and scores the decision chain.
 *
 * Nothing here signs or sends a transaction. "Execute" means produce a
 * verifiable decision artifact (hashes + stage verdict), which is the honest
 * boundary of a reference model.
 */

import {
  extractIntentHeuristic,
  loadKnownAddresses,
  normalizeIntentFromLlm,
  type IntentSpec,
} from "./ai-draft";
import { bridgeIntent, BridgeError } from "./intent-bridge";
import {
  evaluateChain,
  type ChainInput,
  type EvaluationChain,
  type ExecutionInput,
  type StageStatus,
  type VotingInput,
} from "./chain";
import {
  chatJson,
  checkLocalAI,
  isLocalAIConfigured,
  parseJsonObject,
  readLocalAIConfig,
  type FetchLike,
  type LocalAIConfig,
} from "./local-ai";

export interface Recommendation {
  /** Who made the recommendation. Stored on the plan, never treated as authority. */
  user: string;
  /** The recommendation itself. This is the only content the planner may use. */
  text: string;
}

export type PlanStepStatus = "pending" | "done" | "blocked";

export interface PlanStep {
  id: string;
  title: string;
  detail: string;
  status: PlanStepStatus;
}

export interface Plan {
  user: string;
  recommendation: string;
  title: string;
  summary: string;
  steps: PlanStep[];
  risks: string[];
  assumptions: string[];
  unresolved: string[];
  intent: IntentSpec;
  mode: "local" | "groq" | "heuristic";
  model?: string;
  warnings: string[];
}

export interface PlanOptions {
  provider?: "auto" | "local" | "groq" | "heuristic";
  knownAddresses?: Record<string, string>;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
}

export type ExecutionStepStatus = "PASS" | "FAIL" | "BLOCKED" | "INFO";

export interface PlanExecutionStep {
  id: string;
  label: string;
  status: ExecutionStepStatus;
  detail: string;
}

export interface PlanExecution {
  plan: Plan;
  verdict: StageStatus;
  steps: PlanExecutionStep[];
  bridge: {
    intentHash: string;
    actionsHash: string;
    actionCount: number;
    ruleCount: number;
  } | null;
  evaluation: EvaluationChain | null;
  blockedReason?: string;
}

export interface ExecuteOptions {
  voting?: VotingInput;
  execution?: ExecutionInput;
}

const PLAN_SYSTEM = `You are the planning layer of AegisDAO IntentLock. You receive ONE recommendation from ONE user and nothing else.

Return ONLY a JSON object (no markdown) with exactly this shape:
{
  "title": string,
  "summary": string,
  "steps": [{ "id": string, "title": string, "detail": string }],
  "risks": string[],
  "assumptions": string[],
  "unresolved": string[],
  "intent": {
    "proposalId": string,
    "version": number,
    "title": string,
    "actions": [{
      "kind": "ERC20_TRANSFER" | "ERC20_APPROVE" | "PARAM_SET" | "UPGRADE" | "OWNERSHIP_TRANSFER" | "MULTICALL",
      "target": string,
      "selector": string,
      "counterparty": string,
      "maxAmount": string,
      "codeHash": string | null,
      "children": [],
      "quote": string,
      "confidence": number
    }],
    "unresolved": [{ "question": string, "quote": string }],
    "assumptions": [{ "name": string, "value": string, "quote": string }]
  }
}

Rules:
- Use ONLY the recommendation. Do not add context, addresses, amounts, or recipients that are not in it.
- Never invent an address or an amount. Use "" and add an unresolved question instead.
- maxAmount is an integer string in base units: USDC/DAI/USDT = 6 decimals, ETH/WETH = 18.
- selector is the 4-byte function selector when the recommendation names a function; otherwise "".
- quote must be copied verbatim from the recommendation and must ground the action.
- steps: 3 to 7 concrete steps, each with a stable kebab-case id.
- If the recommendation is not executable, return actions: [] and an unresolved item saying exactly what is missing.
- Do not output anything except the JSON object.`;

function buildPlanPrompt(rec: Recommendation, known: Record<string, string>): string {
  return `User: ${rec.user}

Recommendation (the ONLY input you may use):
"""
${rec.text}
"""

Known contract names -> addresses (use only these; never invent addresses):
${JSON.stringify(known, null, 2)}

Return the JSON object now.`;
}

/**
 * Turn one user's recommendation into a plan. A local model is preferred;
 * Groq is the optional fallback; the deterministic planner always works.
 */
export async function planFromRecommendation(
  rec: Recommendation,
  options: PlanOptions = {}
): Promise<Plan> {
  const text = rec.text.trim();
  if (!text) throw new Error("Recommendation text is empty.");

  const provider = options.provider ?? "auto";
  const known = options.knownAddresses ?? loadKnownAddresses();
  const warnings: string[] = [];

  const localCfg = readLocalAIConfig(process.env, {
    model: process.env.LOCAL_AI_MODEL,
    timeoutMs: options.timeoutMs,
  });
  if (options.fetchImpl) localCfg.fetchImpl = options.fetchImpl;

  const localReady =
    provider === "local" || (provider === "auto" && isLocalAIConfigured(process.env));

  if (provider !== "heuristic" && localReady) {
    if (!(await checkLocalAI(localCfg))) {
      warnings.push("Local AI endpoint is not reachable; using the deterministic plan.");
    } else {
      try {
        const content = await chatJson(localCfg, PLAN_SYSTEM, buildPlanPrompt(rec, known));
        return normalizePlan(
          parseJsonObject(content),
          rec,
          known,
          "local",
          localCfg.model,
          warnings
        );
      } catch (error) {
        warnings.push(`Local planner failed (${message(error)}); using deterministic plan.`);
      }
    }
  }

  const groqKey = process.env.GROQ_API_KEY;
  if (provider === "groq" || (provider === "auto" && !localReady && groqKey)) {
    if (groqKey) {
      const groqCfg: LocalAIConfig = {
        baseUrl: "https://api.groq.com/openai/v1",
        model: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
        apiKey: groqKey,
        timeoutMs: options.timeoutMs ?? 12_000,
        fetchImpl: options.fetchImpl,
      };
      try {
        const content = await chatJson(groqCfg, PLAN_SYSTEM, buildPlanPrompt(rec, known));
        return normalizePlan(
          parseJsonObject(content),
          rec,
          known,
          "groq",
          groqCfg.model,
          warnings
        );
      } catch (error) {
        warnings.push(`Groq planner failed (${message(error)}); using deterministic plan.`);
      }
    }
  }

  return heuristicPlan(rec, known, warnings);
}

/**
 * Execute a plan: validate, bridge to hashes, score the decision chain.
 * No transaction is signed or sent.
 */
export function executePlan(plan: Plan, options: ExecuteOptions = {}): PlanExecution {
  const steps: PlanExecutionStep[] = [];
  const intent = plan.intent;

  if (intent.actions.length === 0) {
    steps.push({
      id: "validate",
      label: "Validate intent",
      status: "FAIL",
      detail: "No executable actions were extracted.",
    });
    return {
      plan,
      verdict: "UNKNOWN",
      steps,
      bridge: null,
      evaluation: null,
      blockedReason: "No executable actions.",
    };
  }

  steps.push({
    id: "validate",
    label: "Validate intent",
    status: "PASS",
    detail: `${intent.actions.length} action(s); ${intent.unresolved.length} unresolved.`,
  });

  if (intent.unresolved.length > 0) {
    const preview = intent.unresolved
      .slice(0, 3)
      .map((item) => item.question)
      .join("; ");
    steps.push({
      id: "bridge",
      label: "Bridge to commitment",
      status: "BLOCKED",
      detail: `${intent.unresolved.length} unresolved item(s): ${preview}`,
    });
    return {
      plan,
      verdict: "UNKNOWN",
      steps,
      bridge: null,
      evaluation: null,
      blockedReason: "Resolve the open questions before bridging.",
    };
  }

  let bridged;
  try {
    bridged = bridgeIntent(intent);
  } catch (error) {
    const reason = error instanceof BridgeError ? error.message : message(error);
    steps.push({ id: "bridge", label: "Bridge to commitment", status: "FAIL", detail: reason });
    return {
      plan,
      verdict: "UNKNOWN",
      steps,
      bridge: null,
      evaluation: null,
      blockedReason: reason,
    };
  }

  steps.push({
    id: "bridge",
    label: "Bridge to commitment",
    status: "PASS",
    detail: `intentHash ${short(bridged.intentHash)} · actionsHash ${short(
      bridged.actionsHash
    )} · ${bridged.rules.length} rule(s)`,
  });

  const chainInput: ChainInput = {
    claims: {
      actions: intent.actions.map((action) => ({
        extraction_confidence: action.confidence,
        evidence_support: action.source && action.source.span ? 1 : null,
      })),
    },
    coi: { linkStrengths: [], undisclosedCount: 0, totalLinkCount: 0 },
    voting: options.voting ?? { voters: [], participationFraction: 0 },
    execution: options.execution ?? { outcome: "PENDING" },
  };

  const evaluation = evaluateChain(chainInput);
  steps.push({
    id: "score",
    label: "Score the decision chain",
    status:
      evaluation.overallStatus === "GREEN"
        ? "PASS"
        : evaluation.overallStatus === "RED"
          ? "FAIL"
          : "INFO",
    detail: evaluation.stages.map((stage) => `${stage.stage} ${stage.status}`).join(" · "),
  });
  steps.push({
    id: "verdict",
    label: "Emit verdict",
    status: evaluation.overallStatus === "GREEN" ? "PASS" : "INFO",
    detail: `Overall ${evaluation.overallStatus}.`,
  });

  return {
    plan,
    verdict: evaluation.overallStatus,
    steps,
    bridge: {
      intentHash: bridged.intentHash,
      actionsHash: bridged.actionsHash,
      actionCount: bridged.actions.length,
      ruleCount: bridged.rules.length,
    },
    evaluation,
  };
}

export function formatPlan(plan: Plan): string {
  const lines = [
    `PLAN · ${plan.title}`,
    `user: ${plan.user}   mode: ${plan.mode}${plan.model ? ` (${plan.model})` : ""}`,
    "",
    plan.summary,
    "",
    "STEPS",
    ...plan.steps.map((step, i) => `  ${i + 1}. [${step.status}] ${step.title} — ${step.detail}`),
  ];
  if (plan.risks.length) lines.push("", "RISKS", ...plan.risks.map((r) => `  - ${r}`));
  if (plan.assumptions.length) {
    lines.push("", "ASSUMPTIONS", ...plan.assumptions.map((a) => `  - ${a}`));
  }
  if (plan.unresolved.length) {
    lines.push("", "UNRESOLVED", ...plan.unresolved.map((u) => `  - ${u}`));
  }
  if (plan.warnings.length) {
    lines.push("", "WARNINGS", ...plan.warnings.map((w) => `  - ${w}`));
  }
  return lines.join("\n");
}

export function formatExecution(exec: PlanExecution): string {
  const lines = [
    `EXECUTION · ${exec.verdict}`,
    ...exec.steps.map((step) => `  [${step.status}] ${step.label} — ${step.detail}`),
  ];
  if (exec.bridge) {
    lines.push("", `intentHash  ${exec.bridge.intentHash}`, `actionsHash ${exec.bridge.actionsHash}`);
  }
  if (exec.blockedReason) lines.push("", `BLOCKED: ${exec.blockedReason}`);
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/* Normalisation                                                       */
/* ------------------------------------------------------------------ */

function normalizePlan(
  raw: unknown,
  rec: Recommendation,
  known: Record<string, string>,
  mode: Plan["mode"],
  model: string,
  warnings: string[]
): Plan {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const intent = normalizeIntentFromLlm(obj.intent ?? {}, rec.text, {
    knownAddresses: known,
  });
  const unresolved = dedupe([
    ...strArray(obj.unresolved),
    ...intent.unresolved.map((item) => item.question),
  ]);

  return {
    user: rec.user,
    recommendation: rec.text,
    title: str(obj.title) || intent.title || "Recommendation plan",
    summary: str(obj.summary) || "Plan derived from the recommendation.",
    steps: normalizeSteps(obj.steps, intent),
    risks: strArray(obj.risks),
    assumptions: dedupe([
      ...assumptionStrings(obj.assumptions),
      ...intent.assumptions.map((item) => `${item.name}: ${item.value}`),
    ]),
    unresolved,
    intent,
    mode,
    model,
    warnings,
  };
}

function heuristicPlan(
  rec: Recommendation,
  known: Record<string, string>,
  warnings: string[]
): Plan {
  const intent = extractIntentHeuristic(rec.text, { knownAddresses: known });
  return {
    user: rec.user,
    recommendation: rec.text,
    title: intent.title,
    summary:
      "Deterministic plan (no model available). Every ambiguous detail is left unresolved for a reviewer.",
    steps: defaultSteps(intent),
    risks: [],
    assumptions: intent.assumptions.map((item) => `${item.name}: ${item.value}`),
    unresolved: intent.unresolved.map((item) => item.question),
    intent,
    mode: "heuristic",
    warnings,
  };
}

function defaultSteps(intent: IntentSpec): PlanStep[] {
  return [
    {
      id: "extract",
      title: "Extract intent",
      detail: `${intent.actions.length} action(s) grounded in the recommendation.`,
      status: "done",
    },
    {
      id: "resolve",
      title: "Resolve unknowns",
      detail: intent.unresolved.length
        ? `${intent.unresolved.length} question(s) must be answered.`
        : "No open questions.",
      status: intent.unresolved.length ? "blocked" : "done",
    },
    {
      id: "bridge",
      title: "Bridge to commitment",
      detail: "Hash the intent into action rules and a commitment.",
      status: "pending",
    },
    {
      id: "score",
      title: "Score the decision chain",
      detail: "CLAIMS · COI · VOTING · EXECUTION.",
      status: "pending",
    },
    {
      id: "verdict",
      title: "Emit verdict",
      detail: "GREEN / YELLOW / RED / UNKNOWN.",
      status: "pending",
    },
  ];
}

function normalizeSteps(raw: unknown, intent: IntentSpec): PlanStep[] {
  const out: PlanStep[] = [];
  const seen = new Set<string>();
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const obj = item as Record<string, unknown>;
      const title = String(obj.title ?? "").trim();
      if (!title) continue;
      let id = String(obj.id ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-+|-+$/g, "");
      if (!id) id = `step-${out.length + 1}`;
      while (seen.has(id)) id = `${id}-${out.length + 1}`;
      seen.add(id);
      out.push({
        id,
        title,
        detail: String(obj.detail ?? "").trim(),
        status: "pending",
      });
      if (out.length >= 7) break;
    }
  }
  return out.length ? out : defaultSteps(intent);
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function assumptionStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>;
        const name = String(obj.name ?? "").trim();
        const val = String(obj.value ?? "").trim();
        if (name && val) return `${name}: ${val}`;
        return name || val;
      }
      return "";
    })
    .filter(Boolean);
}

function strArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>;
        return String(obj.question ?? obj.name ?? obj.value ?? "").trim();
      }
      return "";
    })
    .filter(Boolean);
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function short(hash: string): string {
  return hash.length > 12 ? `${hash.slice(0, 10)}…` : hash;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
