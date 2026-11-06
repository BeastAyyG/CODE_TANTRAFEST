import { expect } from "chai";
import { ethers } from "hardhat";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { DeployFixture, deployAegisFixture, proposeAndQueue } from "./fixture";
import { Action, ActionRule, ActionKind } from "../../packages/shared/hash";

async function deployHostile(f: DeployFixture) {
  const HostileModule = await ethers.getContractFactory("HostileModule");
  return HostileModule.deploy(
    await f.executor.getAddress(),
    await f.feeModule.getAddress(),
    f.attacker.address
  );
}

async function executeQueued(f: DeployFixture, actions: Action[], rules: ActionRule[], title: string) {
  const q = await proposeAndQueue(f, actions, rules, title);
  return f.executor.execute(q.proposalId, q.version, q.versionHash, q.disclosureHash, actions, rules);
}

describe("Red-Team Arena · Scenario 13: Control Changes After the Call", () => {
  it("[S13] rejects a module that hands ownership to someone other than the committed owner", async () => {
    const f = await deployAegisFixture();
    const hostile = await deployHostile(f);
    const hostileAddr = await hostile.getAddress();

    const actions: Action[] = [
      {
        target: hostileAddr,
        value: 0n,
        data: hostile.interface.encodeFunctionData("transferOwnership", [f.devWallet.address]),
      },
    ];
    const rules: ActionRule[] = [
      {
        kind: ActionKind.OWNERSHIP_TRANSFER,
        target: hostileAddr,
        selector: "0xf2fde38b",
        counterparty: f.devWallet.address,
        maxAmount: 0n,
        codeHash: ethers.ZeroHash,
        childCount: 0,
      },
    ];

    await expect(executeQueued(f, actions, rules, "Hand module to the dev multisig"))
      .to.be.revertedWithCustomError(f.executor, "PostConditionFailed")
      .withArgs("owner is not the committed owner", anyValue);
    expect(await hostile.owner()).to.equal(await f.executor.getAddress());
  });

  it("[S13] rejects a parameter change that also moves ownership", async () => {
    const f = await deployAegisFixture();
    const hostile = await deployHostile(f);
    const hostileAddr = await hostile.getAddress();

    const actions: Action[] = [
      { target: hostileAddr, value: 0n, data: hostile.interface.encodeFunctionData("setFee", [30]) },
    ];
    const rules: ActionRule[] = [
      {
        kind: ActionKind.PARAM_SET,
        target: hostileAddr,
        selector: "0x69fe0e2d", // setFee(uint256)
        counterparty: ethers.ZeroAddress,
        maxAmount: 100n,
        codeHash: ethers.ZeroHash,
        childCount: 0,
      },
    ];

    await expect(executeQueued(f, actions, rules, "Routine parameter tuning"))
      .to.be.revertedWithCustomError(f.executor, "PostConditionFailed")
      .withArgs("owner changed without a committed rule", anyValue);
    expect(await hostile.owner()).to.equal(await f.executor.getAddress());
    expect(await hostile.fee()).to.equal(0n);
  });

  it("[S13] rejects an upgrade that lands on a different implementation", async () => {
    const f = await deployAegisFixture();
    const hostile = await deployHostile(f);
    const hostileAddr = await hostile.getAddress();
    const FeeModule = await ethers.getContractFactory("FeeModule");
    const v2 = await FeeModule.deploy(30, await f.executor.getAddress());
    const v2Addr = await v2.getAddress();

    const actions: Action[] = [
      { target: hostileAddr, value: 0n, data: hostile.interface.encodeFunctionData("upgradeTo", [v2Addr]) },
    ];
    const rules: ActionRule[] = [
      {
        kind: ActionKind.UPGRADE,
        target: hostileAddr,
        selector: "0x3659cfe6", // upgradeTo(address)
        counterparty: v2Addr,
        maxAmount: 0n,
        codeHash: ethers.keccak256(await ethers.provider.getCode(v2Addr)),
        childCount: 0,
      },
    ];

    await expect(executeQueued(f, actions, rules, "Fee module v2"))
      .to.be.revertedWithCustomError(f.executor, "PostConditionFailed")
      .withArgs("implementation is not the committed implementation", anyValue);
    expect(await hostile.implementation()).to.equal(await f.feeModule.getAddress());
  });

  it("[S13] honest upgrades and ownership transfers still execute", async () => {
    const f = await deployAegisFixture();
    const treasuryAddr = await f.treasuryProxy.getAddress();
    const FeeModule = await ethers.getContractFactory("FeeModule");
    const v2 = await FeeModule.deploy(30, treasuryAddr);
    const v2Addr = await v2.getAddress();

    const actions: Action[] = [
      { target: treasuryAddr, value: 0n, data: f.treasuryProxy.interface.encodeFunctionData("upgradeTo", [v2Addr]) },
      {
        target: treasuryAddr,
        value: 0n,
        data: f.treasuryProxy.interface.encodeFunctionData("transferOwnership", [f.devWallet.address]),
      },
    ];
    const rules: ActionRule[] = [
      {
        kind: ActionKind.UPGRADE,
        target: treasuryAddr,
        selector: "0x3659cfe6",
        counterparty: v2Addr,
        maxAmount: 0n,
        codeHash: ethers.keccak256(await ethers.provider.getCode(v2Addr)),
        childCount: 0,
      },
      {
        kind: ActionKind.OWNERSHIP_TRANSFER,
        target: treasuryAddr,
        selector: "0xf2fde38b",
        counterparty: f.devWallet.address,
        maxAmount: 0n,
        codeHash: ethers.ZeroHash,
        childCount: 0,
      },
    ];

    await expect(executeQueued(f, actions, rules, "Treasury v2 and handover")).to.emit(
      f.executor,
      "ProposalExecuted"
    );
    expect(await f.treasuryProxy.implementation()).to.equal(v2Addr);
    expect(await f.treasuryProxy.owner()).to.equal(f.devWallet.address);
  });
});
