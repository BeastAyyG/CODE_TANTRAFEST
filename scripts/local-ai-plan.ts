/**
 * scripts/local-ai-plan.ts
 *
 * Recommendation -> plan -> execution, from the command line.
 *
 *   npm run plan -- --user agastya \
 *     --recommendation "Transfer 5,000 USDC to 0x14dC... for the Q3 audit."
 *
 *   npm run plan -- --file recommendation.txt --execute --demo-vote
 *
 * Flags:
 *   --user <name>            who made the recommendation (default: anonymous)
 *   --recommendation <text>  the recommendation
 *   --file <path>            read the recommendation from a file
 *   --provider <mode>        auto | local | groq | heuristic (default: auto)
 *   --execute                bridge + score the plan after planning
 *   --demo-vote              supply a synthetic passed vote to the score stage
 *   --out <path>             write the full execution JSON
 *   --json                   print JSON instead of text
 */

import * as fs from "fs";
import * as path from "path";
import { loadKnownAddresses } from "../intelligence/ai-draft";
import {
  executePlan,
  formatExecution,
  formatPlan,
  planFromRecommendation,
  type PlanOptions,
  type Recommendation,
} from "../intelligence/recommendation";

const VALUE_FLAGS = ["--user", "--recommendation", "--file", "--provider", "--out"];

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function has(name: string): boolean {
  return process.argv.includes(name);
}

function readRecommendation(): string {
  const inline = arg("--recommendation");
  if (inline) return inline;
  const file = arg("--file");
  if (file) return fs.readFileSync(path.resolve(file), "utf8");

  const positional: string[] = [];
  for (let i = 2; i < process.argv.length; i++) {
    const token = process.argv[i];
    if (VALUE_FLAGS.includes(token)) {
      i++;
      continue;
    }
    if (!token.startsWith("--")) positional.push(token);
  }
  if (positional.length) return positional.join(" ");
  throw new Error('Provide --recommendation "..." or --file <path>.');
}

async function main(): Promise<void> {
  const rec: Recommendation = {
    user: arg("--user") ?? "anonymous",
    text: readRecommendation(),
  };
  const provider = (arg("--provider") ?? "auto") as PlanOptions["provider"];

  const plan = await planFromRecommendation(rec, {
    provider,
    knownAddresses: loadKnownAddresses(),
  });

  if (has("--json") && !has("--execute")) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }
  console.log(formatPlan(plan));

  if (!has("--execute")) return;

  const exec = executePlan(
    plan,
    has("--demo-vote")
      ? {
          voting: {
            voters: [
              {
                address: "0x00000000000000000000000000000000000000a1",
                weight: 1,
                informed: true,
                coiFlagged: false,
              },
              {
                address: "0x00000000000000000000000000000000000000a2",
                weight: 1,
                informed: true,
                coiFlagged: false,
              },
              {
                address: "0x00000000000000000000000000000000000000a3",
                weight: 1,
                informed: true,
                coiFlagged: false,
              },
            ],
            participationFraction: 0.62,
          },
        }
      : {}
  );

  console.log("");
  console.log(has("--json") ? JSON.stringify(exec, null, 2) : formatExecution(exec));

  const out = arg("--out");
  if (out) fs.writeFileSync(path.resolve(out), JSON.stringify(exec, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
