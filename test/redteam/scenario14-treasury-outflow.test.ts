import { expect } from "chai";
import { ethers } from "hardhat";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { DeployFixture, deployAegisFixture, proposeAndQueue } from "./fixture";
import { Action, ActionRule, ActionKind } from "../../packages/shared/hash";

const USDC = 1_000_000n;

async function deployDrainer(f: DeployFixture) {
  const StaleAllowanceDrainer = await ethers.getContractFactory("StaleAllowanceDrainer");
  return StaleAllowanceDrainer.deploy(
    await f.usdc.getAddress(),
    await f.executor.getAddress(),
    f.attacker.address
  );
}

function approveRule(token: string, spender: string, amount: bigint): ActionRule {
  return {
    kind: ActionKind.ERC20_APPROVE,
    target: token,
    selector: "0x095ea7b3",
    counterparty: spender,
    maxAmount: amount,
    codeHash: ethers.ZeroHash,
    childCount: 0,
  };
}

function transferRule(token: string, to: string, amount: bigint): ActionRule {
  return {
    kind: ActionKind.ERC20_TRANSFER,
    target: token,
    selector: "0xa9059cbb",
    counterparty: to,
    maxAmount: amount,
    codeHash: ethers.ZeroHash,
    childCount: 0,
  };
}

function setFeeRule(target: string): ActionRule {
  return {
    kind: ActionKind.PARAM_SET,
    target,
    selector: "0x69fe0e2d", // setFee(uint256)
    counterparty: ethers.ZeroAddress,
    maxAmount: 100n,
    codeHash: ethers.ZeroHash,
    childCount: 0,
  };
}

async function executeQueued(f: DeployFixture, actions: Action[], rules: ActionRule[], title: string) {
  const q = await proposeAndQueue(f, actions, rules, title);
  return f.executor.execute(q.proposalId, q.version, q.versionHash, q.disclosureHash, actions, rules);
}

describe("Red-Team Arena · Scenario 14: Treasury Outflow Budget", () => {
  it("[S14] a 'fee tuning' call cannot spend an allowance left by an earlier proposal", async () => {
    const f = await deployAegisFixture();
    const usdcAddr = await f.usdc.getAddress();
    const executorAddr = await f.executor.getAddress();
    const drainer = await deployDrainer(f);
    const drainerAddr = await drainer.getAddress();
    const allowance = 50_000n * USDC;
    const payment = 5_000n * USDC;

    // An earlier, honest proposal approves the module for a planned buyback.
    const approveActions: Action[] = [
      { target: usdcAddr, value: 0n, data: f.usdc.interface.encodeFunctionData("approve", [drainerAddr, allowance]) },
    ];
    await (await executeQueued(f, approveActions, [approveRule(usdcAddr, drainerAddr, allowance)], "Buyback allowance")).wait();
    expect(await f.usdc.allowance(executorAddr, drainerAddr)).to.equal(allowance);

    // Later: pay a vendor and "tune the fee". setFee spends the stale allowance.
    const actions: Action[] = [
      { target: usdcAddr, value: 0n, data: f.usdc.interface.encodeFunctionData("transfer", [f.devWallet.address, payment]) },
      { target: drainerAddr, value: 0n, data: drainer.interface.encodeFunctionData("setFee", [30]) },
    ];
    const rules: ActionRule[] = [transferRule(usdcAddr, f.devWallet.address, payment), setFeeRule(drainerAddr)];
    const balanceBefore = await f.usdc.balanceOf(executorAddr);

    await expect(executeQueued(f, actions, rules, "Vendor payment and fee tuning"))
      .to.be.revertedWithCustomError(f.executor, "PostConditionFailed")
      .withArgs("treasury outflow exceeds committed budget", anyValue);
    expect(await f.usdc.balanceOf(executorAddr)).to.equal(balanceBefore);
    expect(await f.usdc.balanceOf(f.attacker.address)).to.equal(0n);
  });

  it("[S14] spending inside the committed budget still executes", async () => {
    const f = await deployAegisFixture();
    const usdcAddr = await f.usdc.getAddress();
    const executorAddr = await f.executor.getAddress();
    const drainer = await deployDrainer(f);
    const drainerAddr = await drainer.getAddress();
    const allowance = 1_000n * USDC;
    const payment = 5_000n * USDC;

    // The module may pull exactly what this proposal approves.
    const actions: Action[] = [
      { target: usdcAddr, value: 0n, data: f.usdc.interface.encodeFunctionData("transfer", [f.devWallet.address, payment]) },
      { target: usdcAddr, value: 0n, data: f.usdc.interface.encodeFunctionData("approve", [drainerAddr, allowance]) },
      { target: drainerAddr, value: 0n, data: drainer.interface.encodeFunctionData("setFee", [30]) },
    ];
    const rules: ActionRule[] = [
      transferRule(usdcAddr, f.devWallet.address, payment),
      approveRule(usdcAddr, drainerAddr, allowance),
      setFeeRule(drainerAddr),
    ];
    const balanceBefore = await f.usdc.balanceOf(executorAddr);

    await expect(executeQueued(f, actions, rules, "Vendor payment and module budget")).to.emit(
      f.executor,
      "ProposalExecuted"
    );
    expect(await f.usdc.balanceOf(executorAddr)).to.equal(balanceBefore - payment - allowance);
  });
});
