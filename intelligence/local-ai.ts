/**
 * intelligence/local-ai.ts
 *
 * Minimal OpenAI-compatible client for a locally hosted model.
 * Works with Ollama (/v1), llama.cpp server, LM Studio, vLLM, and any
 * endpoint that implements POST /chat/completions.
 *
 * No cloud dependency: the base URL defaults to Ollama on localhost.
 */

export type FetchLike = (
  url: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  }
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
}>;

export interface LocalAIConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
  timeoutMs: number;
  fetchImpl?: FetchLike;
}

export class LocalAIError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "LocalAIError";
  }
}

const DEFAULT_BASE_URL = "http://localhost:11434/v1";
const DEFAULT_MODEL = "llama3.1";

export function readLocalAIConfig(
  env: NodeJS.ProcessEnv = process.env,
  overrides: Partial<LocalAIConfig> = {}
): LocalAIConfig {
  return {
    baseUrl: (overrides.baseUrl ?? env.LOCAL_AI_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, ""),
    model: overrides.model ?? env.LOCAL_AI_MODEL ?? DEFAULT_MODEL,
    apiKey: overrides.apiKey ?? env.LOCAL_AI_API_KEY ?? "local",
    timeoutMs: overrides.timeoutMs ?? Number(env.LOCAL_AI_TIMEOUT_MS ?? 60_000),
    fetchImpl: overrides.fetchImpl,
  };
}

/** True when the operator has pointed us at a local model. */
export function isLocalAIConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.LOCAL_AI_BASE_URL || env.LOCAL_AI_MODEL);
}

/** Cheap reachability probe; never throws. */
export async function checkLocalAI(config: LocalAIConfig = readLocalAIConfig()): Promise<boolean> {
  const fetchImpl = config.fetchImpl ?? ((globalThis as { fetch?: FetchLike }).fetch as FetchLike);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(config.timeoutMs, 2500));
  try {
    const res = await fetchImpl(`${config.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ask the model for a JSON object. Temperature is 0 and the prompt is the
 * caller's responsibility: this function only handles transport.
 */
export async function chatJson(
  config: LocalAIConfig,
  system: string,
  user: string
): Promise<string> {
  const fetchImpl = config.fetchImpl ?? ((globalThis as { fetch?: FetchLike }).fetch as FetchLike);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const res = await fetchImpl(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        max_tokens: 2048,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new LocalAIError(`Local AI HTTP ${res.status}: ${text.slice(0, 200)}`, res.status);
    }
    const payload = JSON.parse(text) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new LocalAIError("Local AI returned an empty completion.");
    }
    return content;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Models often wrap JSON in ```json fences or add a sentence around it.
 * Extract the outermost object and parse it.
 */
export function parseJsonObject(raw: string): unknown {
  let text = raw.trim();
  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) text = fence[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) text = text.slice(start, end + 1);
  return JSON.parse(text);
}
