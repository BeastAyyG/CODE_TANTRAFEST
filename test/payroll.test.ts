import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

const UNIT = 1_000_000n; // MockUSDC has 6 decimals
const HOUR = 3_600n;
const DAY = 86_400n;
const HIGH_BPS = 15_000n; // 150% of base rate
const LOW_BPS = 10_000n; // 100% of base rate
const RUNWAY_HORIZON = 30n * DAY;
const COMPANY_STREAM = 12_000n; // combined per-second stream of the fixture's three employees

const HIGH_PACKAGE = {
  name: "Package A - High Pressure / High Pay",
  rateBps: HIGH_BPS,
  expectedHoursPerWeek: 45,
  detailsHash: ethers.id("package A details"),
};

const LOW_PACKAGE = {
  name: "Package B - Sustainable / Lower Pay",
  rateBps: LOW_BPS,
  expectedHoursPerWeek: 35,
  detailsHash: ethers.id("package B details"),
};

type Fixture = Awaited<ReturnType<typeof deployPayrollFixture>>;

/**
 * Deterministic fixture: all state-changing transactions are pinned to exact
 * block timestamps so every accrual expectation below is exact integer math.
 * Base rates are token units (1e-6) per second:
 *   alice 5_000/s, bob 4_000/s, carol 3_000/s → 12_000/s company-wide.
 */
async function deployPayrollFixture() {
  const [deployer, board, vendor, alice, bob, carol, dave, outsider] = await ethers.getSigners();

  const usdc = await (await ethers.getContractFactory("MockUSDC")).deploy();
  const vault = await (await ethers.getContractFactory("PayrollVault")).deploy(
    usdc.target,
    board.address,
    LOW_BPS,
  );
  const governor = await (await ethers.getContractFactory("PayrollGovernor")).deploy(
    vault.target,
    board.address,
    HOUR,
    4_000n,
  );
  await vault.connect(board).setGovernor(governor.target);
  const working = await (await ethers.getContractFactory("WorkingCapitalVault")).deploy(
    usdc.target,
    board.address,
    vault.target,
  );

  // Treasury seed: mint MockUSDC to the board, park operating funds in working capital.
  await usdc.mint(board.address, 2_000_000n * UNIT);
  await usdc.connect(board).approve(working.target, ethers.MaxUint256);
  await working.connect(board).deposit(600_000n * UNIT);

  // Hire three employees at pinned timestamps.
  const t0 = BigInt(await time.latest()) + 10n;
  await time.setNextBlockTimestamp(t0);
  await vault.connect(board).hire(alice.address, 5_000n);
  await time.setNextBlockTimestamp(t0 + 1n);
  await vault.connect(board).hire(bob.address, 4_000n);
  await time.setNextBlockTimestamp(t0 + 2n);
  await vault.connect(board).hire(carol.address, 3_000n);

  return { deployer, board, vendor, alice, bob, carol, dave, outsider, usdc, vault, governor, working, t0 };
}

/** Sets the next block timestamp (must be strictly greater than latest). */
async function at(ts: bigint): Promise<void> {
  await time.setNextBlockTimestamp(ts);
}

/** Creates the standard HIGH-vs-LOW proposal as the board at `when`. */
async function createDefaultProposal(f: Fixture, when: bigint): Promise<bigint> {
  await at(when);
  await f.governor.connect(f.board).createProposal(HIGH_PACKAGE, LOW_PACKAGE);
  return (await f.governor.proposalCount()); // ids start at 1; this is the latest id
}

async function vote(f: Fixture, id: bigint, voter: SignerWithAddress, forHigh: boolean, when?: bigint) {
  if (when !== undefined) await at(when);
  await f.governor.connect(voter).castVote(id, forHigh);
}

/** Pins the next transaction to exactly `latest + n` and returns that timestamp. */
async function tick(n = 1n): Promise<bigint> {
  const ts = BigInt(await time.latest()) + n;
  await time.setNextBlockTimestamp(ts);
  return ts;
}

describe("Payroll DAO", () => {
  // ──────────────────────────────────────────
  // 1. Deployment & access control
  // ──────────────────────────────────────────
  describe("deployment & access control", () => {
    it("wires board, governor and token; governor wiring is one-time", async () => {
      const f = await loadFixture(deployPayrollFixture);
      expect(await f.vault.token()).to.equal(f.usdc.target);
      expect(await f.vault.board()).to.equal(f.board.address);
      expect(await f.vault.governor()).to.equal(f.governor.target);
      expect(await f.vault.packageRateBps()).to.equal(LOW_BPS);
      expect(await f.working.payrollVault()).to.equal(f.vault.target);

      await expect(
        f.vault.connect(f.board).setGovernor(f.outsider.address),
      ).to.be.revertedWithCustomError(f.vault, "GovernorAlreadySet");
    });

    it("board-only functions reject non-board callers", async () => {
      const f = await loadFixture(deployPayrollFixture);
      await expect(
        f.vault.connect(f.outsider).hire(f.outsider.address, 1_000n),
      ).to.be.revertedWithCustomError(f.vault, "NotBoard").withArgs(f.outsider.address);
      await expect(
        f.vault.connect(f.board).applyPackage(HIGH_BPS),
      ).to.be.revertedWithCustomError(f.vault, "NotGovernor").withArgs(f.board.address);
      await expect(
        f.working.connect(f.outsider).fundPayroll(1n),
      ).to.be.revertedWithCustomError(f.working, "NotBoard").withArgs(f.outsider.address);
      await expect(
        f.governor.connect(f.outsider).createProposal(HIGH_PACKAGE, LOW_PACKAGE),
      ).to.be.revertedWithCustomError(f.governor, "NotBoard");
    });
  });

  // ──────────────────────────────────────────
  // 2. Employee registry
  // ──────────────────────────────────────────
  describe("employee registry", () => {
    it("hires at the current package rate and lists active employees", async () => {
      const f = await loadFixture(deployPayrollFixture);
      const active = await f.vault.activeEmployees();
      expect(active).to.deep.equal([f.alice.address, f.bob.address, f.carol.address]);
      expect(await f.vault.effectiveRateOf(f.alice.address)).to.equal(5_000n); // 100% package
      expect(await f.vault.baseRateOf(f.alice.address)).to.equal(5_000n);
    });

    it("rejects duplicate hires, zero rates and edits on non-employees", async () => {
      const f = await loadFixture(deployPayrollFixture);
      await expect(
        f.vault.connect(f.board).hire(f.alice.address, 5_000n),
      ).to.be.revertedWithCustomError(f.vault, "AlreadyActiveEmployee");
      await expect(
        f.vault.connect(f.board).hire(f.dave.address, 0n),
      ).to.be.revertedWithCustomError(f.vault, "ZeroRate");
      await expect(
        f.vault.connect(f.board).setBaseRate(f.dave.address, 1_000n),
      ).to.be.revertedWithCustomError(f.vault, "UnknownEmployee");
      await expect(
        f.vault.connect(f.board).removeEmployee(f.dave.address),
      ).to.be.revertedWithCustomError(f.vault, "UnknownEmployee");
    });
  });

  // ──────────────────────────────────────────
  // 3. Voting: one person, one vote
  // ──────────────────────────────────────────
  describe("voting", () => {
    it("a HIGH majority applies the high-pay package to future pay", async () => {
      const f = await loadFixture(deployPayrollFixture);
      const id = await createDefaultProposal(f, f.t0 + 10n);
      await vote(f, id, f.alice, true, f.t0 + 11n);
      await vote(f, id, f.bob, true, f.t0 + 12n);
      await vote(f, id, f.carol, false, f.t0 + 13n);

      const executeAt = f.t0 + 5_000n; // voting ends at proposal + 1h
      await at(executeAt);
      await expect(f.governor.connect(f.deployer).execute(id)) // permissionless
        .to.emit(f.vault, "PackageApplied")
        .withArgs(LOW_BPS, HIGH_BPS, executeAt);

      expect(await f.vault.packageRateBps()).to.equal(HIGH_BPS);
      expect(await f.vault.effectiveRateOf(f.alice.address)).to.equal(7_500n); // 150%
      expect(await f.governor.pendingOutcome(id)).to.equal(1n); // ExecutedHigh
      expect(await f.governor.activeProposalId()).to.equal(0n);
    });

    it("a LOW majority moves pay back down; both outcomes change only FUTURE pay", async () => {
      const f = await loadFixture(deployPayrollFixture);
      // First vote takes pay UP to 150%.
      const up = await createDefaultProposal(f, f.t0 + 10n);
      await vote(f, up, f.alice, true, f.t0 + 11n);
      await vote(f, up, f.bob, true, f.t0 + 12n);
      await vote(f, up, f.carol, false, f.t0 + 13n);
      await at(f.t0 + 5_000n);
      await f.governor.connect(f.deployer).execute(up);

      // Second vote takes pay back DOWN to 100%.
      const down = await createDefaultProposal(f, f.t0 + 6_000n);
      await vote(f, down, f.alice, false, f.t0 + 6_001n);
      await vote(f, down, f.bob, false, f.t0 + 6_002n);
      await vote(f, down, f.carol, false, f.t0 + 6_003n);
      await at(f.t0 + 10_000n);
      await f.governor.connect(f.deployer).execute(down);

      expect(await f.vault.packageRateBps()).to.equal(LOW_BPS);
      expect(await f.vault.effectiveRateOf(f.alice.address)).to.equal(5_000n);
    });

    it("one person one vote: double voting is prevented", async () => {
      const f = await loadFixture(deployPayrollFixture);
      const id = await createDefaultProposal(f, f.t0 + 10n);
      await vote(f, id, f.alice, true, f.t0 + 11n);
      await expect(
        f.governor.connect(f.alice).castVote(id, false),
      ).to.be.revertedWithCustomError(f.governor, "AlreadyVoted").withArgs(f.alice.address, id);
      // The first vote still stands exactly once.
      const p = await f.governor.getProposal(id);
      expect(p.votesHigh).to.equal(1n);
      expect(p.votesLow).to.equal(0n);
    });

    it("non-employees and later hires cannot vote (creation-time snapshot)", async () => {
      const f = await loadFixture(deployPayrollFixture);
      const id = await createDefaultProposal(f, f.t0 + 10n);

      // An outsider was never an employee.
      await expect(
        f.governor.connect(f.outsider).castVote(id, true),
      ).to.be.revertedWithCustomError(f.governor, "NotEligible").withArgs(f.outsider.address, id);

      // An employee hired AFTER the snapshot cannot vote on it either.
      await tick(); // a reverted vote attempt still consumes a block, so pin relative to latest
      await f.vault.connect(f.board).hire(f.dave.address, 2_000n);
      expect(await f.governor.isEligible(id, f.dave.address)).to.equal(false);
      await expect(
        f.governor.connect(f.dave).castVote(id, true),
      ).to.be.revertedWithCustomError(f.governor, "NotEligible").withArgs(f.dave.address, id);

      // The snapshot (and therefore the quorum bar) is frozen at creation.
      const p = await f.governor.getProposal(id);
      expect(p.snapshot).to.deep.equal([f.alice.address, f.bob.address, f.carol.address]);
      expect(p.quorumVotes).to.equal(2n); // ceil(3 * 40%)
    });

    it("an employee removed after snapshot creation can still vote theirs", async () => {
      const f = await loadFixture(deployPayrollFixture);
      const id = await createDefaultProposal(f, f.t0 + 10n);
      await at(f.t0 + 11n);
      await f.vault.connect(f.board).removeEmployee(f.carol.address);
      expect(await f.governor.isEligible(id, f.carol.address)).to.equal(true);
      await vote(f, id, f.carol, false, f.t0 + 12n); // snapshot preserves their say
    });

    it("votes close at the deadline and execution only happens after it", async () => {
      const f = await loadFixture(deployPayrollFixture);
      const id = await createDefaultProposal(f, f.t0 + 10n); // voting ends t0+10+3600
      await at(f.t0 + 3_600n); // still open: execution is premature
      await expect(
        f.governor.connect(f.deployer).execute(id),
      ).to.be.revertedWithCustomError(f.governor, "VotingStillOpen");
      await time.increaseTo(f.t0 + 10n + HOUR); // exactly the deadline
      await expect(
        f.governor.connect(f.alice).castVote(id, true),
      ).to.be.revertedWithCustomError(f.governor, "VotingClosed");
    });

    it("missing quorum leaves pay unchanged and unlocks the next proposal", async () => {
      const f = await loadFixture(deployPayrollFixture);
      const id = await createDefaultProposal(f, f.t0 + 10n);
      await vote(f, id, f.alice, true, f.t0 + 11n); // 1 vote < quorum 2
      await at(f.t0 + 5_000n);
      await expect(f.governor.connect(f.deployer).execute(id)).to.emit(f.governor, "ProposalClosed");

      expect(await f.vault.packageRateBps()).to.equal(LOW_BPS);
      expect(await f.governor.pendingOutcome(id)).to.equal(3n);
      expect(await f.governor.activeProposalId()).to.equal(0n);

      // The board can immediately propose again.
      const next = await createDefaultProposal(f, f.t0 + 5_001n);
      expect(next).to.equal(id + 1n);
    });

    it("a dead-even tie leaves pay unchanged", async () => {
      const f = await loadFixture(deployPayrollFixture);
      const id = await createDefaultProposal(f, f.t0 + 10n);
      await vote(f, id, f.alice, true, f.t0 + 11n);
      await vote(f, id, f.bob, false, f.t0 + 12n); // 1-1 meets quorum 2
      await at(f.t0 + 5_000n);
      await f.governor.connect(f.deployer).execute(id);
      expect(await f.governor.pendingOutcome(id)).to.equal(4n); // FailedTie
      expect(await f.vault.packageRateBps()).to.equal(LOW_BPS);
    });

    it("the board may cancel a pending proposal; nobody else can", async () => {
      const f = await loadFixture(deployPayrollFixture);
      const id = await createDefaultProposal(f, f.t0 + 10n);
      await expect(
        f.governor.connect(f.alice).cancel(id),
      ).to.be.revertedWithCustomError(f.governor, "NotBoard");
      await tick();
      await f.governor.connect(f.board).cancel(id);
      expect(await f.governor.pendingOutcome(id)).to.equal(5n); // Canceled
      expect(await f.vault.packageRateBps()).to.equal(LOW_BPS);
    });

    it("rejects a second proposal while one is open and malformed packages", async () => {
      const f = await loadFixture(deployPayrollFixture);
      const id = await createDefaultProposal(f, f.t0 + 10n);
      await expect(
        f.governor.connect(f.board).createProposal(HIGH_PACKAGE, LOW_PACKAGE),
      ).to.be.revertedWithCustomError(f.governor, "ActiveProposalExists").withArgs(id);

      await f.governor.connect(f.board).cancel(id);
      const equal = { ...HIGH_PACKAGE, rateBps: LOW_BPS };
      await expect(
        f.governor.connect(f.board).createProposal(equal, LOW_PACKAGE),
      ).to.be.revertedWithCustomError(f.governor, "InvalidPackages");
      const inverted = { ...LOW_PACKAGE, rateBps: HIGH_BPS };
      await expect(
        f.governor.connect(f.board).createProposal(LOW_PACKAGE, inverted),
      ).to.be.revertedWithCustomError(f.governor, "InvalidPackages");
    });

    it("rejects proposals when there are no employees to vote", async () => {
      const [, board] = await ethers.getSigners();
      const usdc = await (await ethers.getContractFactory("MockUSDC")).deploy();
      const vault = await (await ethers.getContractFactory("PayrollVault")).deploy(
        usdc.target,
        board.address,
        LOW_BPS,
      );
      const governor = await (await ethers.getContractFactory("PayrollGovernor")).deploy(
        vault.target,
        board.address,
        HOUR,
        4_000n,
      );
      await vault.connect(board).setGovernor(governor.target);
      await expect(
        governor.connect(board).createProposal(HIGH_PACKAGE, LOW_PACKAGE),
      ).to.be.revertedWithCustomError(governor, "NoEmployees");
    });
  });

  // ──────────────────────────────────────────
  // 4. Streaming accrual — future-only, never retroactive
  // ──────────────────────────────────────────
  describe("streaming accrual", () => {
    it("accrues at the old rate up to the switch and the new rate only after it", async () => {
      const f = await loadFixture(deployPayrollFixture);
      const { vault, governor, alice, bob, carol, t0 } = f;

      await time.increaseTo(t0 + 1_000n); // ~11.6 days of work at the 100% package
      expect(await vault.accruedOf(alice.address)).to.equal(5_000n * 1_000n);

      const id = await createDefaultProposal(f, t0 + 1_001n);
      await vote(f, id, alice, true, t0 + 1_002n);
      await vote(f, id, bob, true, t0 + 1_003n);
      await vote(f, id, carol, false, t0 + 1_004n);

      const executeAt = t0 + 5_000n; // past the 1-hour voting window
      await at(executeAt);
      await governor.connect(f.deployer).execute(id);

      // Nothing was re-rated: every second before execution stayed at 5_000/s.
      expect(await vault.accruedOf(alice.address)).to.equal(5_000n * 5_000n);
      // The HIGH package applies strictly from the execution timestamp onward.
      expect(await vault.effectiveRateOf(alice.address)).to.equal(7_500n);

      await time.increaseTo(t0 + 9_000n);
      expect(await vault.accruedOf(alice.address)).to.equal(5_000n * 5_000n + 7_500n * 4_000n);
      expect(await vault.accruedOf(bob.address)).to.equal(4_000n * 4_999n + 6_000n * 4_000n);
      expect(await vault.accruedOf(carol.address)).to.equal(3_000n * 4_998n + 4_500n * 4_000n);
      expect(await vault.totalVestedUnwithdrawn()).to.equal(
        55_000_000n + 43_996_000n + 32_994_000n,
      );
      // Runway is quoted at the new rates from now on.
      expect(await vault.futureCommittedRunway(RUNWAY_HORIZON)).to.equal(18_000n * RUNWAY_HORIZON);
    });

    it("board salary edits are future-only too", async () => {
      const f = await loadFixture(deployPayrollFixture);
      await time.increaseTo(f.t0 + 1_000n);
      const t1 = await tick(); // the edit block lands exactly here
      await f.vault.connect(f.board).setBaseRate(f.alice.address, 10_000n);
      expect(await f.vault.accruedOf(f.alice.address)).to.equal(5_000n * (t1 - f.t0)); // untouched past
      await time.increaseTo(f.t0 + 1_500n);
      expect(await f.vault.accruedOf(f.alice.address)).to.equal(
        5_000n * (t1 - f.t0) + 10_000n * (f.t0 + 1_500n - t1),
      );
    });

    it("removal freezes accrual but vested wages stay withdrawable forever", async () => {
      const f = await loadFixture(deployPayrollFixture);
      await topUpPayroll(f, 100n * UNIT);
      await time.increaseTo(f.t0 + 1_000n);
      const t1 = await tick(); // removal block lands exactly here
      await f.vault.connect(f.board).removeEmployee(f.carol.address);

      await time.increaseTo(f.t0 + 5_000n);
      expect(await f.vault.accruedOf(f.carol.address)).to.equal(3_000n * (t1 - f.t0 - 2n)); // frozen at removal
      expect(await f.vault.effectiveRateOf(f.carol.address)).to.equal(0n);
      expect((await f.vault.activeEmployees()).length).to.equal(2);

      const before = await f.usdc.balanceOf(f.carol.address);
      await f.vault.connect(f.carol).withdrawAll();
      expect(await f.usdc.balanceOf(f.carol.address)).to.equal(before + 3_000n * (t1 - f.t0 - 2n));
    });
  });

  // ──────────────────────────────────────────
  // 5. Withdrawal (pull-based payout)
  // ──────────────────────────────────────────
  describe("withdrawal", () => {
    it("pays exactly what was accrued and reduces only the caller's owed amount", async () => {
      const f = await loadFixture(deployPayrollFixture);
      await topUpPayroll(f, 100n * UNIT);
      await time.increaseTo(f.t0 + 1_000n);
      await at(f.t0 + 1_000n + 1n);

      const vaultBefore = await f.usdc.balanceOf(f.vault.target);
      const aliceBefore = await f.usdc.balanceOf(f.alice.address);
      await expect(f.vault.connect(f.alice).withdraw(2_500_000n))
        .to.emit(f.vault, "Withdrawal")
        .withArgs(f.alice.address, 2_500_000n, 2_500_000n);

      expect(await f.usdc.balanceOf(f.alice.address)).to.equal(aliceBefore + 2_500_000n);
      expect(await f.usdc.balanceOf(f.vault.target)).to.equal(vaultBefore - 2_500_000n);
      expect(await f.vault.accruedOf(f.alice.address)).to.equal(5_000n * 1_001n - 2_500_000n);
      expect(await f.vault.accruedOf(f.bob.address)).to.equal(4_000n * 1_000n); // others untouched
    });

    it("rejects over-withdrawal, zero amounts and non-employees", async () => {
      const f = await loadFixture(deployPayrollFixture);
      await time.increaseTo(f.t0 + 1_000n);
      await at(f.t0 + 1_000n + 1n);
      await expect(
        f.vault.connect(f.alice).withdraw(6_000_000n), // accrued is 5_005_000
      ).to.be.revertedWithCustomError(f.vault, "ExceedsAccrued").withArgs(6_000_000n, 5_005_000n);
      await expect(
        f.vault.connect(f.alice).withdraw(0n),
      ).to.be.revertedWithCustomError(f.vault, "NothingToWithdraw");
      await expect(
        f.vault.connect(f.outsider).withdrawAll(),
      ).to.be.revertedWithCustomError(f.vault, "NotEmployee").withArgs(f.outsider.address);
    });

    it("withdrawAll drains the full vested amount", async () => {
      const f = await loadFixture(deployPayrollFixture);
      await topUpPayroll(f, 100n * UNIT);
      await time.increaseTo(f.t0 + 1_000n);
      await at(f.t0 + 1_000n + 1n);
      const before = await f.usdc.balanceOf(f.bob.address);
      await f.vault.connect(f.bob).withdrawAll();
      expect(await f.usdc.balanceOf(f.bob.address)).to.equal(before + 4_000n * 1_000n); // bob hired at t0+1
      expect(await f.vault.accruedOf(f.bob.address)).to.equal(0n);
    });
  });

  // ──────────────────────────────────────────
  // 6. Ring-fencing: the treasury cannot touch payroll
  // ──────────────────────────────────────────
  describe("ring-fencing", () => {
    it("the board cannot pull payroll funds — withdraw only ever pays the employee", async () => {
      const f = await loadFixture(deployPayrollFixture);
      await topUpPayroll(f, 100n * UNIT);
      await time.increaseTo(f.t0 + 1_000n);
      const liquid = await f.vault.liquidPayrollBalance();
      await expect(
        f.vault.connect(f.board).withdraw(1n),
      ).to.be.revertedWithCustomError(f.vault, "NotEmployee").withArgs(f.board.address);
      await expect(
        f.vault.connect(f.board).withdrawAll(),
      ).to.be.revertedWithCustomError(f.vault, "NotEmployee").withArgs(f.board.address);
      expect(await f.vault.liquidPayrollBalance()).to.equal(liquid); // untouched
    });

    it("there is no escape hatch: a raw token-transfer call on the vault reverts", async () => {
      const f = await loadFixture(deployPayrollFixture);
      await topUpPayroll(f, 100n * UNIT);
      const liquid = await f.vault.liquidPayrollBalance();
      // transfer(address,uint256) selector — the vault exposes no such path.
      const data =
        "0xa9059cbb" +
        ethers.AbiCoder.defaultAbiCoder()
          .encode(["address", "uint256"], [f.vendor.address, 10_000_000n])
          .slice(2);
      await expect(
        f.board.sendTransaction({ to: f.vault.target, data }),
      ).to.be.reverted;
      expect(await f.vault.liquidPayrollBalance()).to.equal(liquid);
    });

    it("funding payroll is a one-way street; company spending bypasses payroll", async () => {
      const f = await loadFixture(deployPayrollFixture);
      await time.increaseTo(f.t0 + 1_000n);
      await tick();
      const payrollBefore = await f.vault.liquidPayrollBalance();
      const workingBefore = await f.working.liquidWorkingBalance();

      await expect(f.working.connect(f.board).fundPayroll(25_000_000n))
        .to.emit(f.working, "PayrollFunded")
        .withArgs(25_000_000n);
      expect(await f.vault.liquidPayrollBalance()).to.equal(payrollBefore + 25_000_000n);
      expect(await f.working.liquidWorkingBalance()).to.equal(workingBefore - 25_000_000n);

      // Ordinary company expense comes out of working capital only.
      const tSpend = await tick();
      const vendorBefore = await f.usdc.balanceOf(f.vendor.address);
      await f.working.connect(f.board).spendTo(f.vendor.address, 5_000_000n);
      expect(await f.usdc.balanceOf(f.vendor.address)).to.equal(vendorBefore + 5_000_000n);
      expect(await f.vault.liquidPayrollBalance()).to.equal(payrollBefore + 25_000_000n);
      // Employee wages are unaffected by treasury spending.
      expect(await f.vault.accruedOf(f.alice.address)).to.equal(5_000n * (tSpend - f.t0));
    });
  });

  // ──────────────────────────────────────────
  // 7. Backing / solvency views
  // ──────────────────────────────────────────
  describe("backing & solvency views", () => {
    it("reports a clean slate with no employees", async () => {
      const [, board] = await ethers.getSigners();
      const usdc = await (await ethers.getContractFactory("MockUSDC")).deploy();
      const vault = await (await ethers.getContractFactory("PayrollVault")).deploy(
        usdc.target,
        board.address,
        LOW_BPS,
      );
      const r = await vault.backingReport(RUNWAY_HORIZON);
      expect(r.liquidBalance).to.equal(0n);
      expect(r.vestedUnwithdrawn).to.equal(0n);
      expect(r.fullyBacked).to.equal(true);
    });

    it("covering only accrued wages is NOT reported as fully backed", async () => {
      const f = await loadFixture(deployPayrollFixture);
      await time.increaseTo(f.t0 + 1_000n);
      const vested = await f.vault.totalVestedUnwithdrawn(); // read and report share one block
      const runway = 12_000n * RUNWAY_HORIZON; // 31_104_000_000

      // Nothing funded yet: even accrued wages are unbacked.
      let r = await f.vault.backingReport(RUNWAY_HORIZON);
      expect(r.vestedUnwithdrawn).to.equal(vested);
      expect(r.accruedBacked).to.equal(false);
      expect(r.fullyBacked).to.equal(false);
      expect(r.accruedShortfall).to.equal(vested);

      // Fund exactly the accrued amount plus the single second the funding
      // block itself adds: honest, but explicitly not "fully backed".
      await at(f.t0 + 1_001n);
      await topUpPayroll(f, vested + COMPANY_STREAM);
      r = await f.vault.backingReport(RUNWAY_HORIZON);
      expect(r.accruedBacked).to.equal(true);
      expect(r.runwayBacked).to.equal(false);
      expect(r.fullyBacked).to.equal(false); // the misleading claim this view exists to prevent
      expect(r.accruedShortfall).to.equal(0n);
      expect(r.runwayShortfall).to.equal(runway);

      // Fund the full committed runway as well: now, and only now, fully backed.
      await at(f.t0 + 1_002n);
      await topUpPayroll(f, runway + COMPANY_STREAM); // + the second the funding block adds
      r = await f.vault.backingReport(RUNWAY_HORIZON);
      expect(r.runwayBacked).to.equal(true);
      expect(r.fullyBacked).to.equal(true);
      expect(await f.vault.isRunwayBacked(RUNWAY_HORIZON)).to.equal(true);
    });
  });

  // ──────────────────────────────────────────
  // 8. Underfunded vault — no overdraw, no hidden shortfall
  // ──────────────────────────────────────────
  describe("underfunded payouts", () => {
    it("insufficient payroll pays out only what is liquid and never overdraws", async () => {
      const f = await loadFixture(deployPayrollFixture);
      await time.increaseTo(f.t0 + 1_000n);
      // Fund only 7 USDC against 11.99 USDC of vested wages.
      await at(f.t0 + 1_001n);
      await topUpPayroll(f, 7_000_000n);

      // Alice is first in line and gets everything she earned.
      await at(f.t0 + 1_002n);
      const aliceBefore = await f.usdc.balanceOf(f.alice.address);
      await f.vault.connect(f.alice).withdrawAll();
      expect(await f.usdc.balanceOf(f.alice.address)).to.equal(aliceBefore + 5_000n * 1_002n);
      expect(await f.vault.liquidPayrollBalance()).to.equal(7_000_000n - 5_000n * 1_002n);

      // Bob's payout is capped at what is left; the remainder stays owed.
      await at(f.t0 + 1_003n);
      const bobBefore = await f.usdc.balanceOf(f.bob.address);
      await expect(f.vault.connect(f.bob).withdrawAll())
        .to.emit(f.vault, "Withdrawal")
        .withArgs(f.bob.address, 4_000n * 1_002n, 7_000_000n - 5_000n * 1_002n);
      expect(await f.usdc.balanceOf(f.bob.address)).to.equal(bobBefore + 7_000_000n - 5_000n * 1_002n);
      expect(await f.vault.accruedOf(f.bob.address)).to.equal(4_000n * 1_002n - (7_000_000n - 5_000n * 1_002n));

      // The vault is empty; Carol cannot trigger a negative balance.
      await expect(
        f.vault.connect(f.carol).withdrawAll(),
      ).to.be.revertedWithCustomError(f.vault, "InsufficientBacking").withArgs(0);
      expect(await f.vault.liquidPayrollBalance()).to.equal(0n);
      // The reverted attempt still mines a block, so reads below are one second later.
      expect(await f.vault.accruedOf(f.carol.address)).to.equal(3_000n * 1_002n); // still owed, never forgiven

      // And the honest view says exactly that.
      const r = await f.vault.backingReport(RUNWAY_HORIZON);
      expect(r.accruedBacked).to.equal(false);
      expect(r.accruedShortfall).to.equal(
        (await f.vault.accruedOf(f.bob.address)) + (await f.vault.accruedOf(f.carol.address)),
      );
    });
  });
});

/** Board tops up the payroll vault from working capital (explicit, one-way). */
async function topUpPayroll(f: Fixture, amount: bigint): Promise<void> {
  await f.working.connect(f.board).fundPayroll(amount);
}
