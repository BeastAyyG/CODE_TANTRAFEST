/**
 * scripts/train-local-model.ts
 *
 * Train the local model on the labelled fixture set and write it to
 * intelligence/models/benefit-model.json.
 *
 *   npm run train:model              # train + save + report accuracy
 *   npm run train:model -- --epochs 1200 --lr 0.2
 */

import * as path from "path";
import { readFileSync } from "fs";

import { featuresFromRecommendation, type Recommendation } from "../intelligence/recommendation";
import { trainAndSaveLocalModel, DEFAULT_MODEL_PATH, loadLocalModel } from "../intelligence/local-model";
import { accuracy, DEFAULT_MODEL, type TrainingExample } from "../intelligence/tiny-model";

const FIXTURES = path.join(__dirname, "..", "intelligence", "fixtures", "recommendations.json");

type Row = Recommendation & { id: string; label: 0 | 1 };

function main(): void {
  const argv = process.argv.slice(2);
  const flag = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };

  const rows: Row[] = JSON.parse(readFileSync(FIXTURES, "utf8"));
  const examples: TrainingExample[] = rows.map((row) => ({
    features: featuresFromRecommendation(row),
    label: row.label,
  }));

  const epochs = Number(flag("epochs") ?? 800);
  const learningRate = Number(flag("lr") ?? 0.25);
  // Anchored to the hand-set prior by default: with 10 examples, unanchored
  // training weakens deliberate priors (it once pushed recipientUnknown from
  // -2.8 to -1.07, which started ACCEPTing unknown recipients).
  const anchorStrength = Number(flag("anchor") ?? 0.05);

  const before = accuracy(DEFAULT_MODEL, examples);
  const result = trainAndSaveLocalModel(examples, DEFAULT_MODEL_PATH, {
    epochs,
    learningRate,
    anchorTo: DEFAULT_MODEL,
    anchorStrength,
  });
  const reloaded = loadLocalModel(DEFAULT_MODEL_PATH);
  const afterReload = accuracy(reloaded, examples);

  console.log("LOCAL MODEL TRAINING");
  console.log(`  examples        ${examples.length}`);
  console.log(`  epochs          ${epochs}   lr ${learningRate}`);
  console.log(`  hand-set prior  ${(before * 100).toFixed(1)}%`);
  console.log(`  trained         ${(result.accuracy * 100).toFixed(1)}%`);
  console.log(`  reload accuracy ${(afterReload * 100).toFixed(1)}%  (artifact round-trip)`);
  console.log(`  artifact        ${result.path}`);
  console.log(`  bias            ${reloaded.bias.toFixed(4)}`);
  console.log(`  weights         [${reloaded.weights.map((w) => w.toFixed(3)).join(", ")}]`);

  if (afterReload < before) {
    console.log(
      `\n  note: trained model scores below the hand-set prior on this small set —`
    );
    console.log(`  keep the prior unless you add more labelled examples.`);
  }
}

main();
