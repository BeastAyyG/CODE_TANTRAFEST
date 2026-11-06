import { expect } from "chai";
import { ethers } from "hardhat";
import { deployAegisFixture, proposeAndQueue } from "./fixture";
import { Action, ActionRule, ActionKind } from "../../packages/shared/hash";

const SET_GOVERNOR_SELECTOR = "0xc42cf535"; // setGovernor(address)

describe("Red-Team Arena · Scenario 12: Guardian Escalation", () => {
  it("[S12] the guardian cannot install a governor of its choosing", async () => {
    const f = await deployAegisFixture();
    const governorAddr = await f.governor.getAddress();

    await expect(f.executor.connect(f.guardian).setGovernor(f.attacker.address))
      .to.be.revertedWithCustomError(f.executor, "NotGovernor")
      .withArgs(f.guardian.address);
    await expect(f.executor.connect(f.attacker).setGovernor(f.attacker.address))
      .to.be.revertedWithCustomError(f.executor, "NotGovernor")
      .withArgs(f.attacker.address);
    expect(await f.executor.governor()).to.equal(governorAddr);
  });

  it("[S12] a passed, timelocked proposal can rotate the governor", async () => {
    const f = await deployAegisFixture();
    const executorAddr = await f.executor.getAddress();
    const oldGovernor = await f.governor.getAddress();
    // Stand-in for a migrated governor contract.
    const newGovernor = f.devWallet.address;

    const actions: Action[] = [
      {
        target: executorAddr,
        value: 0n,
        data: f.executor.interface.encodeFunctionData("setGovernor", [newGovernor]),
      },
    ];
    const rules: ActionRule[] = [
      {
        kind: ActionKind.PARAM_SET,
        target: executorAddr,
        selector: SET_GOVERNOR_SELECTOR,
        counterparty: ethers.ZeroAddress,
        maxAmount: 0n,
        codeHash: ethers.ZeroHash,
        childCount: 0,
      },
    ];

    const q = await proposeAndQueue(f, actions, rules, "Governor migration");
    await expect(
      f.executor.execute(
        q.proposalId,
        q.version,
        q.versionHash,
        q.disclosureHash,
        actions,
        rules
      )
    )
      .to.emit(f.executor, "GovernorChanged")
      .withArgs(oldGovernor, newGovernor);
    expect(await f.executor.governor()).to.equal(newGovernor);
  });
});
