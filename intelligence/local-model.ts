/**
 * intelligence/local-model.ts
 *
 * The local model.
 *
 * Two layers, both local, both offline-capable:
 *
 *  1. The **model artifact** (always available). A trained model stored as a
 *     file in `intelligence/models/benefit-model.json` and loaded at runtime.
 *     This is the authoritative judge: it produces the verdict, and because it
 *     is a linear model every verdict decomposes into per-feature
 *     contributions. No network, no server, no API key, no dependencies.
 *
 *  2. An optional **small local server** (Ollama or any llama.cpp-compatible
 *     endpoint) used only to *read* a recommendation when the structured facts
 *     are missing. It never authors a plan and never produces the verdict.
 *     It is opt-in via env and off by default; when unreachable the code falls
 *     back to the artifact without any cloud call.
 *
 * "Local" is enforced, not assumed: the server client refuses any base URL
 * that is not loopback unless LOCAL_ALLOW_REMOTE=1 is set explicitly.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import * as path from "path";

import {
  DEFAULT_MODEL,
  FEATURE_NAMES,
  accuracy,
  modelFromJson,
  modelToJson,
  predict,
  trainTinyModel,
  type BenefitFeatures,
  type Prediction,
  type TinyModel,
  type TrainingExample,
} from "./tiny-model";

// ---------------------------------------------------------------------------
// 1. The model artifact
// ---------------------------------------------------------------------------

export const MODEL_DIR = path.join(__dirname, "models");
export const DEFAULT_MODEL_PATH = path.join(MODEL_DIR, "benefit-model.json");

/**
 * Load the trained model from disk.
 *
 * Falls back to the hand-set prior if the artifact is missing or malformed —
 * the system must never fail to answer just because a file was deleted.
 */
export function loadLocalModel(file: string = DEFAULT_MODEL_PATH): TinyModel {
  if (!existsSync(file)) return { ...DEFAULT_MODEL };
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    const model = modelFromJson(parsed);
    if (!model) return { ...DEFAULT_MODEL };
    return model;
  } catch {
    return { ...DEFAULT_MODEL };
  }
}

/** Persist a model to disk as the local artifact. */
export function saveLocalModel(
  model: TinyModel,
  file: string = DEFAULT_MODEL_PATH
): TinyModel {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, modelToJson(model), "utf8");
  return model;
}

/** Train on labelled examples and write the artifact. Returns the model + accuracy. */
export function trainAndSaveLocalModel(
  examples: TrainingExample[],
  file: string = DEFAULT_MODEL_PATH,
  options: {
    epochs?: number;
    learningRate?: number;
    l2?: number;
    /** Shrink toward a reference model while fitting — see tiny-model.ts. */
    anchorTo?: TinyModel;
    anchorStrength?: number;
  } = {}
): { model: TinyModel; accuracy: number; path: string } {
  const model = trainTinyModel(examples, options);
  saveLocalModel(model, file);
  return { model, accuracy: accuracy(model, examples), path: file };
}

/** Does an artifact exist on disk right now? */
export function hasLocalModel(file: string = DEFAULT_MODEL_PATH): boolean {
  return existsSync(file) && modelFromJson(safeParse(file)) !== null;
}

/**
 * Which model is actually in force: the trained artifact, or the hand-set
 * prior because the artifact is missing/unreadable. Printed by the CLI so a
 * verdict can always be traced to the weights that produced it.
 */
export function localModelSource(file: string = DEFAULT_MODEL_PATH):
  | { source: "artifact"; path: string }
  | { source: "prior"; path: string; reason: string } {
  if (!existsSync(file)) {
    return { source: "prior", path: file, reason: "artifact file not found" };
  }
  if (modelFromJson(safeParse(file)) === null) {
    return { source: "prior", path: file, reason: "artifact unparseable" };
  }
  return { source: "artifact", path: file };
}

/** Score a feature vector with the local artifact. */
export function judgeWithLocalModel(
  features: BenefitFeatures,
  file: string = DEFAULT_MODEL_PATH
): Prediction {
  return predict(loadLocalModel(file), features);
}

/** Train from the labelled fixture set shipped with the repo. */
export function retrainFromFixtures(
  fixturesPath: string = path.join(__dirname, "fixtures", "recommendations.json"),
  file: string = DEFAULT_MODEL_PATH
): { model: TinyModel; accuracy: number; path: string; examples: number } {
  const raw: Array<{ label: 0 | 1 } & Record<string, unknown>> = JSON.parse(
    readFileSync(fixturesPath, "utf8")
  );
  // featuresFromRecommendation lives in recommendation.ts; require-free import
  // is not possible here without a cycle, so callers pass vectors in.
  const examples = raw
    .map((row) => row.__features as BenefitFeatures | undefined)
    .filter((f): f is BenefitFeatures => Boolean(f))
    .map((features, index) => ({ features, label: raw[index].label }));

  if (examples.length === 0) {
    throw new Error(
      "no feature vectors in fixture set — pass precomputed features"
    );
  }
  const result = trainAndSaveLocalModel(examples, file);
  return { ...result, examples: examples.length };
}

function safeParse(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 2. Optional small local server (Ollama / llama.cpp compatible)
// ---------------------------------------------------------------------------

export interface LocalServerConfig {
  baseUrl: string;
  /** A *small* model by default. Not llama3.1/70B-class. */
  model: string;
  apiKey?: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

export type LocalServerEnv = Record<string, string | undefined>;

/** Very small by design: 1.1B params, ~637 MB. Override with LOCAL_MODEL. */
export const DEFAULT_LOCAL_MODEL = "tinyllama";

export function readLocalServerConfig(
  env: LocalServerEnv = process.env as LocalServerEnv,
  overrides: Partial<LocalServerConfig> = {}
): LocalServerConfig {
  return {
    baseUrl: overrides.baseUrl ?? env.LOCAL_BASE_URL ?? "http://127.0.0.1:11434/v1",
    model: overrides.model ?? env.LOCAL_MODEL ?? DEFAULT_LOCAL_MODEL,
    apiKey: overrides.apiKey ?? env.LOCAL_API_KEY,
    timeoutMs: overrides.timeoutMs ?? Number(env.LOCAL_TIMEOUT_MS ?? 20000),
    fetchImpl: overrides.fetchImpl,
  };
}

export function isLocalServerConfigured(
  env: LocalServerEnv = process.env as LocalServerEnv
): boolean {
  return Boolean(env.LOCAL_BASE_URL);
}

/**
 * A remote endpoint is refused unless explicitly allowed. This is what makes
 * the integration honest: "local" is checked, not just intended.
 */
export function isLoopbackUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]" ||
      hostname === "::1"
    );
  } catch {
    return false;
  }
}

export function assertLocalOnly(
  config: LocalServerConfig,
  env: LocalServerEnv = process.env as LocalServerEnv
): void {
  if (env.LOCAL_ALLOW_REMOTE === "1") return;
  if (!isLoopbackUrl(config.baseUrl)) {
    throw new Error(
      `local model endpoint must be loopback, got ${config.baseUrl}. ` +
        `Set LOCAL_ALLOW_REMOTE=1 to override.`
    );
  }
}

/**
 * Ports a local model server typically listens on, in the order we try them.
 *   11434 Ollama · 1234 LM Studio · 8080 llama.cpp / ollama serve
 *   8000  text-generation-webui · 5001 LocalAI
 */
export const COMMON_LOCAL_PORTS = [11434, 1234, 8080, 8000, 5001];

/**
 * Look for a local model server that is already running, so a machine with
 * Ollama installed needs no configuration at all. Probes each candidate's
 * OpenAI-compatible `/v1/models` (Ollama, LM Studio, llama.cpp and LocalAI all
 * expose it) and returns the first one that answers.
 *
 * Returns null — never throws — when nothing is running.
 */
export async function discoverLocalServer(options: {
  ports?: number[];
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
} = {}): Promise<LocalServerConfig | null> {
  const ports = options.ports ?? COMMON_LOCAL_PORTS;
  const timeoutMs = options.timeoutMs ?? 600;
  const fetchImpl = options.fetchImpl ?? (fetch as unknown as typeof fetch);

  for (const port of ports) {
    const candidate = readLocalServerConfig(
      {},
      { baseUrl: `http://127.0.0.1:${port}/v1`, timeoutMs, fetchImpl }
    );
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${candidate.baseUrl}/models`, {
        headers: candidate.apiKey ? { Authorization: `Bearer ${candidate.apiKey}` } : {},
        signal: controller.signal,
      });
      if (response.ok) return candidate;
    } catch {
      // Port closed or refused — try the next one.
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

/** Probe the local server. Returns false on any failure — never throws. */
export async function checkLocalServer(
  config: LocalServerConfig
): Promise<boolean> {
  try {
    assertLocalOnly(config);
    const fetchImpl = config.fetchImpl ?? (fetch as unknown as typeof fetch);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const response = await fetchImpl(`${config.baseUrl}/models`, {
        headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {},
        signal: controller.signal,
      });
      return response.ok;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return false;
  }
}

export interface LocalServerReading {
  decision: "ACCEPT" | "DENY";
  benefit: number;
  rationale: string;
}

const READING_SYSTEM_PROMPT = `You are a treasury risk reader. You are given one recommendation.
Estimate whether it benefits the treasury. Reply with JSON only:
{"decision":"ACCEPT"|"DENY","benefit":<0..1>,"rationale":"<=30 words"}
Never invent numbers that are not in the text. You do not author plans.`;

/**
 * Ask the small local model to *read* a recommendation.
 *
 * Returns null whenever the server is absent, unhealthy, or returns anything
 * unparseable — the caller then falls back to the artifact model. This is
 * advisory only: it never decides.
 */
export async function readWithLocalServer(
  config: LocalServerConfig,
  text: string
): Promise<LocalServerReading | null> {
  try {
    assertLocalOnly(config);
    const fetchImpl = config.fetchImpl ?? (fetch as unknown as typeof fetch);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: "system", content: READING_SYSTEM_PROMPT },
            { role: "user", content: text },
          ],
          temperature: 0,
        }),
        signal: controller.signal,
      });

      if (!response.ok) return null;

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = payload.choices?.[0]?.message?.content;
      if (!content) return null;

      const parsed = parseJsonObject(content) as Partial<LocalServerReading> | null;
      if (!parsed) return null;

      const decision = parsed.decision === "ACCEPT" ? "ACCEPT" : "DENY";
      const benefit =
        typeof parsed.benefit === "number" && Number.isFinite(parsed.benefit)
          ? Math.min(1, Math.max(0, parsed.benefit))
          : decision === "ACCEPT"
            ? 0.5
            : 0.5;
      return {
        decision,
        benefit,
        rationale: typeof parsed.rationale === "string" ? parsed.rationale : "",
      };
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

/** Extract the first JSON object from a model reply, tolerating prose or fences. */
export function parseJsonObject(content: string): unknown | null {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : content;

  const start = body.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < body.length; i++) {
    if (body[i] === "{") depth++;
    else if (body[i] === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(body.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** Feature names, re-exported so callers can build vectors without importing twice. */
export { FEATURE_NAMES };
