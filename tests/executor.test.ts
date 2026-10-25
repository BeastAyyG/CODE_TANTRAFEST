import { describe, expect, it } from "vitest";
import { ADDRESSES, CHAIN_ID, ERROR_BY_NAME } from "../packages/shared/addresses";
import type { EncodableCall } from "../packages/shared/calls";
import type { ExecutionContext, Scenario } from "../reference/types";
import { runScenario } from "../reference/executor";
import { getDemo } from "../lib/demo";

function context(): ExecutionContext {
  const demo = getDemo();
  return {
    proposalId: demo.proposal.id,
    chainId: CHAIN_ID,
    executor: ADDRESSES.executor,
    intent: demo.committed,
    evidenceRoot: demo.manifest.root,
    disclosureHash: demo.disclosureHash,
    approvedCalls: demo.approvedCalls,
  };
}

function synthetic(mutate: (scenario: Scenario) => void, calls: EncodableCall[] = []): Scenario {
  const demo = getDemo();
  const scenario = structuredClone(
    demo.scenarioRows.find((row) => row.scenario.id === "00-benign-grant")!.scenario,
  );
  if (calls.length > 0) {
    scenario.mode = "attack";
    scenario.calls = calls;
  }
  mutate(scenario);
  return scenario;
}

describe("reference executor", () => {
  it("produces the expected verdict for all seeded scenarios", () => {
    const demo = getDemo();
    for (const row of demo.scenarioRows) {
      expect(row.run.status, row.scenario.id).toBe(row.scenario.expected.status);
      expect(row.run.code, row.scenario.id).toBe(row.scenario.expected.code);
    }
    expect(demo.arenaSummary.mismatches).toBe(0);
  });

  it("executes the benign bundle as committed", () => {
    const demo = getDemo();
    const run = demo.runs["00-benign-grant"];
    expect(run.status).toBe("PASSED");
    expect(run.commitmentMatched).toBe(true);
    expect(run.txHash).not.toBeNull();
    expect(run.report.status).toBe("PASSED");
    expect(run.violatedConstraint).toBeNull();
  });

  it("rejects a substituted recipient with a specific error", () => {
    const demo = getDemo();
    const run = demo.runs["01-recipient-substitution"];
    expect(run.status).toBe("REJECTED");
    expect(run.code).toBe("UnauthorizedRecipient");
    expect(run.revertData.slice(0, 10)).toBe(ERROR_BY_NAME.UnauthorizedRecipient.selector);
    expect(run.commitmentMatched).toBe(false);
  });

  it("rejects an uncommitted upgrade and keeps the jargon beside the decoded call", () => {
    const demo = getDemo();
    const run = demo.runs["03-jargon-upgrade"];
    expect(run.code).toBe("SelectorNotAuthorized");
    expect(run.report.approved).toHaveLength(3);
    expect(run.report.submitted).toHaveLength(1);
    expect(run.report.submitted[0].humanText).toContain("Upgrades TreasuryProxy");
    expect(run.report.proposalSaid).toContain("align the treasury implementation");
    expect(run.revertData.slice(0, 10)).toBe(ERROR_BY_NAME.SelectorNotAuthorized.selector);
  });

  it("rejects a hidden ownership transfer inside a multicall", () => {
    const demo = getDemo();
    const run = demo.runs["04-nested-ownership"];
    expect(run.code).toBe("NestedCallNotAuthorized");
    expect(run.revertData.slice(0, 10)).toBe(ERROR_BY_NAME.NestedCallNotAuthorized.selector);
    expect(run.submitted[0].nested[1].function).toBe("transferOwnership()");
  });

  it("blocks early execution and stale versions", () => {
    const demo = getDemo();
    expect(demo.runs["08-early-execution"].code).toBe("TimelockNotElapsed");
    expect(demo.runs["08-early-execution"].status).toBe("REJECTED");
    expect(demo.runs["09-stale-version"].code).toBe("StaleVersion");
  });

  it("flags a disclosure challenge without invoking the executor", () => {
    const demo = getDemo();
    const run = demo.runs["10-undisclosed-link"];
    expect(run.status).toBe("FLAGGED");
    expect(run.layer).toBe("disclosure");
    expect(run.challenge?.linkCount).toBe(4);
    expect(run.report.violatedConstraint?.code).toBe("UndisclosedLink");
  });

  it("rejects native value, wrong chain and double execution", () => {
    const wrongChain = runScenario(
      synthetic((scenario) => {
        scenario.context.chainId = 1;
      }),
      context(),
    );
    expect(wrongChain.code).toBe("WrongChain");

    const doubleExecution = runScenario(
      synthetic((scenario) => {
        scenario.context.executed = true;
      }),
      context(),
    );
    expect(doubleExecution.code).toBe("AlreadyExecuted");
  });

  it("rejects unknown selectors", () => {
    const run = runScenario(
      synthetic(() => undefined, [
        {
          kind: "PARAM_SET",
          target: ADDRESSES.usdc,
          counterparty: ADDRESSES.attacker,
          rawCalldata: "0xdeadbeef",
        },
      ]),
      context(),
    );
    expect(run.code).toBe("UnknownSelector");
    expect(run.submitted[0].unknown).toBe(true);
    expect(run.revertData.slice(0, 10)).toBe(ERROR_BY_NAME.UnknownSelector.selector);
  });

  it("enforces the cumulative spend post-condition", () => {
    const run = runScenario(
      synthetic(() => undefined, [
        {
          kind: "ERC20_TRANSFER",
          target: ADDRESSES.usdc,
          counterparty: ADDRESSES.growthLabs,
          amount: "200000000000",
        },
        {
          kind: "ERC20_TRANSFER",
          target: ADDRESSES.usdc,
          counterparty: ADDRESSES.developerGuild,
          amount: "50000000000",
        },
        {
          kind: "ERC20_APPROVE",
          target: ADDRESSES.usdc,
          counterparty: ADDRESSES.treasuryOps,
          amount: "5000000000",
        },
        {
          kind: "ERC20_TRANSFER",
          target: ADDRESSES.usdc,
          counterparty: ADDRESSES.growthLabs,
          amount: "200000000000",
        },
      ]),
      context(),
    );
    expect(run.code).toBe("PostConditionViolated");
    expect(run.steps.find((step) => step.id === "budget")?.status).toBe("FAIL");
  });

  it("produces a stable simulated tx hash for the same bundle", () => {
    const demo = getDemo();
    const first = runScenario(demo.scenarioRows[0].scenario, context());
    const second = runScenario(demo.scenarioRows[0].scenario, context());
    expect(first.txHash).toBe(second.txHash);
    expect(first.report).toEqual(second.report);
  });
});
