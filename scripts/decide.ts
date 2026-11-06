/**
 * scripts/decide.ts
 *
 * The local-AI decision CLI: one recommendation in, ACCEPT or DENY out, and
 * for an ACCEPT, the executable plan.
 *
 * No network. No LLM. No API key. The classifier is the 9-feature logistic
 * regression in intelligence/tiny-model.ts; the plan is produced by the
 * repo's own intent-bridge, so a decision never invents an action.
 *
 * Usage:
 *   npm run decide -- "Transfer 5,000 USDC to 0xabc... for the audit"
 *   npm run decide -- --file rec.json
 *   npm run decide -- --fixtures
 *   npm run decide -- --train
 */

import { readFileSync } from "fs";
import * as path from "path";

import {
  decideRecommendation,
  featuresFromRecommendation,
  type Decision,
  type Recommendation,
} from "../intelligence/recommendation";

import {
  DEFAULT_MODEL,
  accuracy,
  modelToJson,
  trainTinyModel,
  type BenefitFeatures,
  type TinyModel,
  type TrainingExample,
} from "../intelligence/tiny-model";

import {
  DEFAULT_MODEL_PATH,
  discoverLocalServer,
  isLocalServerConfigured,
  loadLocalModel,
  localModelSource,
  readLocalServerConfig,
  checkLocalServer,
  trainAndSaveLocalModel,
} from "../intelligence/local-model";

import { bridgeIntent, BridgeError } from "../intelligence/intent-bridge";

// ---------------------------------------------------------------------------
// Terminal helpers
// ---------------------------------------------------------------------------

const BOLD = "\u001b[1m";
const DIM = "\u001b[2m";
const RED = "\u001b[31m";
const GREEN = "\u001b[32m";
const CYAN = "\u001b[36m";
const RESET = "\u001b[0m";

const FIXTURE_PATH = path.join(__dirname, "..", "intelligence", "fixtures", "recommendations.json");

// ---------------------------------------------------------------------------
// Plan: turn an ACCEPTed recommendation into execution-ready calldata
// ---------------------------------------------------------------------------

export interface Plan {
  intentHash: string;
  actionsHash: string;
  actions: Array<{ target: string; value: string; data: string }>;
}

export function buildPlan(decision: Decision): Plan | { blocked: string[] } {
  try {
    const bridged = bridgeIntent(decision.intent);
    return {
      intentHash: bridged.intentHash,
      actionsHash: bridged.actionsHash,
      actions: bridged.actions.map((action) => ({
        target: action.target,
        value: action.value.toString(),
        data: action.data,
      })),
    };
  } catch (error) {
    if (error instanceof BridgeError) {
      // The unresolved questions live on the intent, not on the error.
      const questions = decision.intent.unresolved.map((item) => item.question);
      return { blocked: questions.length > 0 ? questions : [error.message] };
    }
    throw error;
  }
}

function printPlan(decision: Decision): void {
  const plan = buildPlan(decision);

  if ("blocked" in plan) {
    console.log(`\n${DIM}PLAN${RESET}  ${RED}blocked${RESET} — the recommendation is not specific enough to execute:`);
    for (const question of plan.blocked) console.log(`  ${RED}?${RESET} ${question}`);
    return;
  }

  console.log(`\n${DIM}PLAN${RESET}  ${plan.actions.length} action(s) ready to execute`);
  console.log(`  intentHash   ${plan.intentHash}`);
  console.log(`  actionsHash  ${plan.actionsHash}`);
  plan.actions.forEach((action, index) => {
    console.log(`  [${index}] ${action.target}  value=${action.value}`);
    console.log(`      data=${action.data}`);
  });
}

// ---------------------------------------------------------------------------
// Modes
// ---------------------------------------------------------------------------

function loadFixtures(): Array<Recommendation & { id: string; label: 0 | 1 }> {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
}

function decideOne(rec: Recommendation, model: TinyModel): Decision {
  return decideRecommendation(rec, model);
}

function printDecision(decision: Decision): void {
  const colour = decision.decision === "ACCEPT" ? GREEN : RED;
  console.log(`\n${BOLD}${colour}DECISION · ${decision.decision}${RESET}  ${DIM}benefit ${(decision.benefit * 100).toFixed(1)}%${RESET}`);
  console.log(`${DIM}user:${RESET} ${decision.user}`);
  console.log(`\n${decision.recommendation}`);
  console.log(`\n${DIM}WHY${RESET}`);
  for (const reason of decision.reasons) console.log(`  ${reason}`);
  console.log(`\n${DIM}FEATURES${RESET}`);
  for (const [name, value] of Object.entries(decision.features)) {
    console.log(`  ${name.padEnd(20)} ${value.toFixed(3)}`);
  }
}

function printModelInfo(model: TinyModel, label: string): void {
  const info = localModelSource(label === DEFAULT_MODEL_PATH ? DEFAULT_MODEL_PATH : label);
  const source = info.source === "artifact" ? `artifact (${label})` : `hand-set prior (${info.reason})`;
  console.log(`${DIM}model:${RESET} ${source}  ${DIM}bias ${model.bias.toFixed(3)}${RESET}`);
}

/**
 * Report whether a small local model server is reachable. It is optional and
 * advisory only — the verdict always comes from the model artifact.
 */
async function printLocalServerInfo(): Promise<void> {
  if (isLocalServerConfigured()) {
    const config = readLocalServerConfig();
    const up = await checkLocalServer(config);
    console.log(
      `${DIM}local server:${RESET} ${up ? `${GREEN}up${RESET} at ${config.baseUrl} (${config.model}) — advisory only` : `${DIM}configured but unreachable (${config.baseUrl})${RESET}`}`
    );
    return;
  }

  const found = await discoverLocalServer();
  if (found) {
    console.log(
      `${DIM}local server:${RESET} ${GREEN}found${RESET} at ${found.baseUrl} (${found.model}) — optional, not required`
    );
  } else {
    console.log(
      `${DIM}local server:${RESET} ${DIM}none running — optional; set LOCAL_BASE_URL to enable${RESET}`
    );
  }
}

function runFixtures(): void {
  const fixtures = loadFixtures();
  const model = loadLocalModel();
  let correct = 0;

  console.log(`${BOLD}Local AI decision engine — ${fixtures.length} labelled recommendations${RESET}`);
  printModelInfo(model, DEFAULT_MODEL_PATH);
  console.log();

  for (const fixture of fixtures) {
    const decision = decideOne(fixture, model);
    const expected = fixture.label === 1 ? "ACCEPT" : "DENY";
    const ok = decision.decision === expected;
    if (ok) correct++;
    const colour = ok ? GREEN : RED;
    const mark = ok ? "ok" : "MISMATCH";
    console.log(
      `  ${fixture.id.padEnd(4)} ${decision.decision.padEnd(7)} benefit ${(decision.benefit * 100)
        .toFixed(1)
        .padStart(6)}%   expected ${expected.padEnd(7)} ${colour}${mark}${RESET}`
    );
  }

  console.log(
    `\n  ${correct}/${fixtures.length} correct  (${((correct / fixtures.length) * 100).toFixed(1)}%)\n`
  );
}

function runTrain(): void {
  const fixtures = loadFixtures();
  const examples: TrainingExample[] = fixtures.map((fixture) => ({
    features: decisionFeatures(fixture),
    label: fixture.label,
  }));

  const before = accuracy(DEFAULT_MODEL, examples);
  const { model: trained, accuracy: score, path } = trainAndSaveLocalModel(examples);
  const reloaded = loadLocalModel(path);

  console.log(`${BOLD}Trained the local model${RESET}`);
  console.log(`  examples     ${examples.length}`);
  console.log(`  hand-set prior accuracy  ${(before * 100).toFixed(1)}%`);
  console.log(`  trained accuracy         ${(score * 100).toFixed(1)}%`);
  console.log(`  reload accuracy          ${(accuracy(reloaded, examples) * 100).toFixed(1)}%  (artifact round-trip)`);
  console.log(`  epochs       800   lr 0.25   l2 0.001   (deterministic)`);
  console.log(`  artifact     ${path}`);
  console.log(`\n${modelToJson(trained)}\n`);
}

/** Feature extraction, re-exported so the training path matches the decision path. */
function decisionFeatures(rec: Recommendation): BenefitFeatures {
  // featuresFromRecommendation is the single source of truth for the vector.
  return featuresFromRecommendation(rec);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function main(): void {
  const argv = process.argv.slice(2);
  const flags = new Set(argv.filter((arg) => arg.startsWith("--")));
  const positional = argv.filter((arg) => !arg.startsWith("--"));

  if (flags.has("--train")) {
    runTrain();
    return;
  }

  if (flags.has("--fixtures")) {
    runFixtures();
    return;
  }

  const fileFlagIndex = argv.indexOf("--file");
  let rec: Recommendation;

  if (fileFlagIndex >= 0) {
    const file = argv[fileFlagIndex + 1];
    if (!file) throw new Error("--file needs a path");
    rec = JSON.parse(readFileSync(file, "utf8"));
  } else if (positional.length > 0) {
    rec = { user: "cli", text: positional.join(" ") };
  } else {
    console.log(
      `${BOLD}Local AI decision engine${RESET}\n\n` +
        `  npm run decide -- "Transfer 5,000 USDC to 0xabc... for the audit"\n` +
        `  npm run decide -- --file rec.json\n` +
        `  npm run decide -- --fixtures\n` +
        `  npm run decide -- --train\n` +
        `  npm run decide -- --model path/to/model.json "..."\n\n` +
        `  ${DIM}The model is a real artifact on disk (intelligence/models/benefit-model.json)\n` +
        `  loaded at runtime; retrain it with npm run train:model.${RESET}\n`
    );
    return;
  }

  const modelIndex = argv.indexOf("--model");
  const modelPath = modelIndex >= 0 ? argv[modelIndex + 1] : DEFAULT_MODEL_PATH;
  if (modelIndex >= 0 && !modelPath) throw new Error("--model needs a path");
  const model = loadLocalModel(modelPath);

  const decision = decideOne(rec, model);
  printModelInfo(model, modelPath);
  printDecision(decision);
  if (decision.decision === "ACCEPT") printPlan(decision);
  console.log();
}

if (require.main === module) {
  (async () => {
    try {
      if (!process.argv.includes("--train") && !process.argv.includes("--fixtures")) {
        await printLocalServerInfo();
      }
      main();
    } catch (error) {
      console.error(`${RED}error${RESET}: ${(error as Error).message}`);
      process.exit(1);
    }
  })();
}
