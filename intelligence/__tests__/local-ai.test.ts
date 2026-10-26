import { strict as assert } from "assert";
import { parseJsonObject } from "../local-ai";
import { executePlan, planFromRecommendation } from "../recommendation";

const KNOWN = { USDC: "0x00000000000000000000000000000000000000b0" };
const RECOMMENDATION =
  "Transfer 5,000 USDC to 0x14dC79964da2C08b23698B3D3cc7Ca32193d9955 for the Q3 audit, and set the fee module to 35 bps.";
const CLEAN =
  "Transfer 5,000 USDC to 0x14dC79964da2C08b23698B3D3cc7Ca32193d9955 for the Q3 audit.";

describe("local-ai — JSON extraction", () => {
  it("parses fenced JSON", () => {
    const parsed = parseJsonObject('```json\n{"a":1}\n```') as { a: number };
    assert.equal(parsed.a, 1);
  });

  it("parses JSON with surrounding prose", () => {
    const parsed = parseJsonObject('Here you go: {"ok":true} done') as { ok: boolean };
    assert.equal(parsed.ok, true);
  });
});

describe("recommendation — heuristic planner", () => {
  it("grounds a transfer action in the recommendation", async () => {
    const plan = await planFromRecommendation(
      { user: "agastya", text: RECOMMENDATION },
      { provider: "heuristic", knownAddresses: KNOWN }
    );
    assert.equal(plan.mode, "heuristic");
    assert.ok(plan.intent.actions.length >= 1);
    assert.ok(plan.steps.length >= 3);
    assert.equal(plan.user, "agastya");
  });

  it("bridges and scores a clean plan", async () => {
    const plan = await planFromRecommendation(
      { user: "agastya", text: CLEAN },
      { provider: "heuristic", knownAddresses: KNOWN }
    );
    const exec = executePlan(plan);
    assert.ok(exec.bridge, exec.blockedReason ?? "bridge missing");
    assert.ok(exec.evaluation);
    assert.ok(["GREEN", "YELLOW", "RED", "UNKNOWN"].includes(exec.verdict));
  });

  it("blocks when the recommendation is underspecified", async () => {
    const plan = await planFromRecommendation(
      { user: "agastya", text: "Transfer some funds to the team." },
      { provider: "heuristic", knownAddresses: KNOWN }
    );
    assert.ok(plan.intent.unresolved.length > 0);
    const exec = executePlan(plan);
    assert.equal(exec.bridge, null);
    assert.ok(exec.blockedReason);
  });
});

describe("recommendation — local model", () => {
  it("uses the model's plan when the endpoint returns JSON", async () => {
    const payload = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              title: "Audit transfer",
              summary: "Pay the auditor from the treasury.",
              steps: [{ id: "pay", title: "Pay the auditor", detail: "Transfer 5,000 USDC." }],
              risks: ["Recipient is fixed in the recommendation"],
              assumptions: [],
              unresolved: [],
              intent: {
                title: "Audit transfer",
                actions: [
                  {
                    kind: "ERC20_TRANSFER",
                    target: "0x00000000000000000000000000000000000000b0",
                    selector: "0xa9059cbb",
                    counterparty: "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955",
                    maxAmount: "5000000000",
                    codeHash: null,
                    children: [],
                    quote: "Transfer 5,000 USDC",
                    confidence: 0.92,
                  },
                ],
                unresolved: [],
                assumptions: [],
              },
            }),
          },
        },
      ],
    };

    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(payload),
      json: async () => payload,
    });

    const plan = await planFromRecommendation(
      { user: "agastya", text: RECOMMENDATION },
      { provider: "local", knownAddresses: KNOWN, fetchImpl }
    );
    assert.equal(plan.mode, "local");
    assert.equal(plan.steps[0].id, "pay");
    assert.equal(plan.intent.actions.length, 1);
    assert.equal(plan.intent.actions[0].maxAmount, "5000000000");
  });
});
