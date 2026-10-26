// AegisDAO local proposal judge.
// Requirement + decoded actions in, accept/reject verdict out.
// Runs fully locally: Ollama on localhost, model qwen2.5:3b. No data leaves the machine.
//
// Usage:
//   node judge.mjs < test-case.json
// Input JSON:  { "requirement": "string", "actions": ["string", ...] }
// Output JSON: { "verdict": "accept" | "reject", "reason": "string" }
//
// Env overrides:
//   JUDGE_MODEL  (default: qwen2.5:3b)
//   OLLAMA_URL   (default: http://localhost:11434/api/generate)

import { readFileSync } from "node:fs";

const MODEL = process.env.JUDGE_MODEL || "qwen2.5:3b";
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434/api/generate";

function buildPrompt(requirement, actions) {
  const listed = actions.map((a, i) => `${i + 1}. ${a}`).join("\n");
  return (
    "You are a strict DAO proposal judge. " +
    `Requirement: ${requirement}. ` +
    "Rule: accept only if every decoded action matches the requirement exactly. " +
    "If any action is extra, hidden, or mismatched, reject. " +
    'Output ONLY this JSON, nothing else: {"verdict": "accept" or "reject", "reason": "one short sentence"} ' +
    `Decoded actions:\n${listed}`
  );
}

function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Model did not return JSON: ${text}`);
  }
  return JSON.parse(text.slice(start, end + 1));
}

async function main() {
  const input = JSON.parse(readFileSync(0, "utf-8"));
  if (!input.requirement || !Array.isArray(input.actions)) {
    throw new Error('Input must be {"requirement": string, "actions": string[]}');
  }
  const res = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      prompt: buildPrompt(input.requirement, input.actions),
      stream: false,
      options: { temperature: 0 },
    }),
  });
  if (!res.ok) {
    throw new Error(`Ollama request failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const verdict = extractJson(data.response);
  if (verdict.verdict !== "accept" && verdict.verdict !== "reject") {
    throw new Error(`Invalid verdict: ${JSON.stringify(verdict)}`);
  }
  console.log(JSON.stringify(verdict));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
