import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import {
  DeployFixture,
  deployAegisFixture,
  proposeAndOpenVoting,
  VOTING_PERIOD,
} from "./fixture";
import { Action, ActionRule, ActionKind } from "../../packages/shared/hash";

const DEFEATED = 3n;

async function openBenignVote(f: DeployFixture) {
  const usdcAddr = await f.usdc.getAddress();
  const amount = 5_000n * 1_000_000n;
  const actions: Action[] = [
    {
      target: usdcAddr,
      value: 0n,
      data: f.usdc.interface.encodeFunctionData("transfer", [f.devWallet.address, amount]),
    },
  ];
  const rules: ActionRule[] = [
    {
      kind: ActionKind.ERC20_TRANSFER,
      target: usdcAddr,
      selector: "0xa9059cbb",
      counterparty: f.devWallet.address,
      maxAmount: amount,
      codeHash: ethers.ZeroHash,
      childCount: 0,
    },
  ];
  return proposeAndOpenVoting(f, actions, rules, "Vendor payment");
}

describe("Red-Team Arena · Scenario 11: Recycled and Flash-Loaned Votes", () => {
  it("[S11] tokens moved after voting opens cannot vote a second time", async () => {
    const f = await deployAegisFixture();
    const { govId } = await openBenignVote(f);
    const weight = await f.votingToken.balanceOf(f.voter1.address);

    await f.governor.connect(f.voter1).castVote(govId, 1);
    // Same tokens, second wallet.
    await f.votingToken.connect(f.voter1).transfer(f.attacker.address, weight);

    await expect(f.governor.connect(f.attacker).castVote(govId, 1))
      .to.be.revertedWithCustomError(f.governor, "InsufficientVotingPower")
      .withArgs(f.attacker.address);
    expect((await f.governor.getGovProposal(govId)).forVotes).to.equal(weight);
  });

  it("[S11] voting power borrowed and repaid in one transaction carries no weight", async () => {
    const f = await deployAegisFixture();
    const { govId } = await openBenignVote(f);
    const FlashLoanVoter = await ethers.getContractFactory("FlashLoanVoter");
    const flash = await FlashLoanVoter.deploy();

    await expect(
      flash.borrowVoteRepay(
        await f.votingToken.getAddress(),
        await f.governor.getAddress(),
        govId,
        ethers.parseEther("1000000")
      )
    )
      .to.be.revertedWithCustomError(f.governor, "InsufficientVotingPower")
      .withArgs(await flash.getAddress());
    expect((await f.governor.getGovProposal(govId)).forVotes).to.equal(0n);
  });

  it("[S11] recycled votes cannot carry a proposal past quorum", async () => {
    const f = await deployAegisFixture();
    const { govId } = await openBenignVote(f);
    // 600 GOV alone is below the 1,000 GOV quorum.
    const weight = await f.votingToken.balanceOf(f.voter1.address);

    await f.governor.connect(f.voter1).castVote(govId, 1);
    await f.votingToken.connect(f.voter1).transfer(f.attacker.address, weight);
    await f.governor
      .connect(f.attacker)
      .castVote(govId, 1)
      .catch(() => undefined);

    await time.increase(VOTING_PERIOD + 1);
    await f.governor.finalizeVote(govId);
    expect((await f.governor.getGovProposal(govId)).state).to.equal(DEFEATED);
  });
});
