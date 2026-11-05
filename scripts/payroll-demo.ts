/**
 * Employee-governed payroll DAO — end-to-end demo against a local node.
 *
 *   npx hardhat node
 *   npx hardhat run scripts/payroll-demo.ts --network localhost
 *
 * Spins up a fresh self-contained instance (so the story is deterministic),
 * then walks through BEFORE / DURING / AFTER:
 *
 *   BEFORE — wages stream per second from the ring-fenced vault; the public
 *            backing report shows vested wages AND committed runway covered.
 *   DURING — the board offers exactly two future work packages (high
 *            pressure/high pay vs sustainable); every employee votes
 *            one-person-one-vote; execution applies the winner to FUTURE pay
 *            from the execution timestamp only.
 *   AFTER  — accrual splits exactly at the switch, the backing report honestly
 *            flags the runway shortfall the vote created (accrued wages stay
 *            fully backed), the board tops payroll up, an employee pulls
 *            vested wages, and board/treasury attempts to touch payroll revert.
 *
 * Weeks of company time pass via the node's EVM time controls. Sanity checks
 * throw if any on-chain number deviates from the expected math.
 */
import { ethers, network } from "hardhat";

const UNIT = 1_000_000n; // 6 decimals
const DAY = 86_400n;
const SECONDS_PER_YEAR = 31_536_000;
const VOTING_PERIOD = 3_600; // 1 hour of voting per proposal
const QUORUM_BPS = 4_000n;
const RUNWAY_HORIZON_DAYS = 45n;

const HIGH_PACKAGE = {
  name: "Package A - Sprint Mode (high pressure / high pay)",
  rateBps: 15_000n, // 150% of base
  expectedHoursPerWeek: 45,
  detailsHash: ethers.id("sprint mode package"),
};

const LOW_PACKAGE = {
  name: "Package B - Sustainable (low pressure / lower pay)",
  rateBps: 10_000n, // 100% of base
  expectedHoursPerWeek: 35,
  detailsHash: ethers.id("sustainable package"),
};

const NAMES = ["Maya", "Leo", "Ana", "Sam"];
const SALARIES_USD = [140_000, 110_000, 95_000, 75_000];

const usdc = (v: bigint) =>
  `${(Number(v) / 1e6).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`;
const perDay = (perSec: bigint) => usdc(perSec * DAY);
const line = (s = "") => console.log(s);
const rule = () => line("─".repeat(78));

function check(actual: bigint, expected: bigint, label: string): void {
  if (actual !== expected) {
    throw new Error(`Demo sanity check failed for ${label}: got ${actual}, expected ${expected}`);
  }
}

async function nowTs(): Promise<number> {
  return Number((await ethers.provider.getBlock("latest"))!.timestamp);
}

async function setNextTs(ts: number): Promise<void> {
  await ethers.provider.send("evm_setNextBlockTimestamp", [ts]);
}

async function jumpTo(ts: number): Promise<void> {
  await setNextTs(ts);
  await ethers.provider.send("evm_mine", []);
}

async function main() {
  const [deployer, board, vendor, ...staff] = await ethers.getSigners();
  const employees = staff.slice(0, NAMES.length);
  if (employees.length < NAMES.length) {
    throw new Error(`Need at least ${NAMES.length + 3} unlocked signers for the demo.`);
  }

  rule();
  line(" EMPLOYEE-GOVERNED PAYROLL DAO — LIVE DEMO");
  line(` network: ${network.name} (chainId ${(await ethers.provider.getNetwork()).chainId})`);
  rule();

  // ── Fresh self-contained instance ────────────────────────────────────────
  const usdcToken = await (await ethers.getContractFactory("MockUSDC")).deploy();
  await usdcToken.waitForDeployment();
  const vault = await (await ethers.getContractFactory("PayrollVault")).deploy(
    usdcToken.target,
    board.address,
    LOW_PACKAGE.rateBps,
  );
  await vault.waitForDeployment();
  const governor = await (await ethers.getContractFactory("PayrollGovernor")).deploy(
    vault.target,
    board.address,
    VOTING_PERIOD,
    QUORUM_BPS,
  );
  await governor.waitForDeployment();
  await (await vault.connect(board).setGovernor(governor.target)).wait();
  const working = await (await ethers.getContractFactory("WorkingCapitalVault")).deploy(
    usdcToken.target,
    board.address,
    vault.target,
  );
  await working.waitForDeployment();

  line("\nContracts:");
  line(`  PayrollVault (ring-fenced payroll): ${vault.target}`);
  line(`  PayrollGovernor (one person = one vote): ${governor.target}`);
  line(`  WorkingCapitalVault (company treasury): ${working.target}`);

  // ── Company setup ────────────────────────────────────────────────────────
  const baseRates = SALARIES_USD.map((s) => BigInt(Math.floor((s * 1e6) / SECONDS_PER_YEAR)));
  let t0 = (await nowTs()) + 5;
  for (let i = 0; i < employees.length; i++) {
    await setNextTs(t0 + i);
    await (await vault.connect(board).hire(employees[i].address, baseRates[i])).wait();
  }

  await (await usdcToken.mint(board.address, 2_000_000n * UNIT)).wait();
  await (await usdcToken.connect(board).approve(working.target, ethers.MaxUint256)).wait();
  await (await working.connect(board).deposit(1_500_000n * UNIT)).wait();

  const sumBase = baseRates.reduce((a, b) => a + b, 0n);
  const initialFunding = sumBase * 60n * DAY; // 60 days of runway at the 100% package
  await (await working.connect(board).fundPayroll(initialFunding)).wait();

  const hireTs = employees.map((_, i) => BigInt(t0 + i));
  line("\nCompany setup:");
  for (let i = 0; i < employees.length; i++) {
    line(`  ${NAMES[i].padEnd(6)} base ${usdc(baseRates[i] * DAY)}/day (≈ $${SALARIES_USD[i].toLocaleString("en-US")}/yr target)`);
  }
  line(`  payroll funded with ${usdc(initialFunding)} — 60 days of committed runway at 100%`);

  // The handful of hire/funding blocks already streamed a few seconds of wages.
  const setupTs = await nowTs();
  let expectedVested = 0n;
  for (let i = 0; i < employees.length; i++) {
    expectedVested += baseRates[i] * (BigInt(setupTs) - hireTs[i]);
  }
  let report = await vault.backingReport(RUNWAY_HORIZON_DAYS * DAY);
  check(report.liquidBalance, initialFunding, "initial liquid balance");
  check(report.vestedUnwithdrawn, expectedVested, "initial vested");
  line(`  backing report: fullyBacked=${report.fullyBacked} (liquid ${usdc(report.liquidBalance)} ≥ vested + ${RUNWAY_HORIZON_DAYS}-day runway)`);

  // ── BEFORE: two weeks of sustainable work ───────────────────────────────
  const beforeTs = t0 + employees.length + Number(14n * DAY);
  await jumpTo(beforeTs);

  rule();
  line("\nBEFORE THE VOTE — two weeks of streaming at the sustainable package (100%)");
  rule();
  const accruedBefore: bigint[] = [];
  for (let i = 0; i < employees.length; i++) {
    const a = await vault.accruedOf(employees[i].address);
    accruedBefore.push(a);
    check(a, baseRates[i] * (BigInt(beforeTs) - hireTs[i]), `${NAMES[i]} pre-vote accrual`);
    line(`  ${NAMES[i].padEnd(6)} accrued ${usdc(a).padStart(14)}  (stream ${perDay(baseRates[i])}/day)`);
  }
  report = await vault.backingReport(RUNWAY_HORIZON_DAYS * DAY);
  check(report.vestedUnwithdrawn, accruedBefore.reduce((a, b) => a + b, 0n), "total vested");
  line(`  backing: vested ${usdc(report.vestedUnwithdrawn)} — accruedBacked=${report.accruedBacked}, runwayBacked=${report.runwayBacked}, fullyBacked=${report.fullyBacked}`);

  // ── DURING: the board offers exactly two packages; everyone votes once ──
  const proposalAt = beforeTs + 10;
  await setNextTs(proposalAt);
  await (await governor.connect(board).createProposal(HIGH_PACKAGE, LOW_PACKAGE)).wait();
  const proposalId = await governor.proposalCount();
  const votingEndsAt = (await governor.getProposal(proposalId)).votingEndsAt;

  line("\nDURING — the board offers exactly two FUTURE work packages:");
  line(`  [H] ${HIGH_PACKAGE.name}: pay x1.5, ${HIGH_PACKAGE.expectedHoursPerWeek}h/week`);
  line(`  [L] ${LOW_PACKAGE.name}: pay x1.0, ${LOW_PACKAGE.expectedHoursPerWeek}h/week`);
  line(`  proposal #${proposalId} open; quorum ${(await governor.getProposal(proposalId)).quorumVotes} of ${employees.length} one-person-one-vote`);

  const choices = [true, true, true, false]; // Maya, Leo, Ana back the sprint; Sam prefers sustainable
  for (let i = 0; i < employees.length; i++) {
    await setNextTs(proposalAt + 1 + i);
    await (await governor.connect(employees[i]).castVote(proposalId, choices[i])).wait();
    line(`  vote  ${NAMES[i].padEnd(6)} → ${choices[i] ? "HIGH pay / high pressure" : "LOW pay / sustainable"}`);
  }

  await jumpTo(Number(votingEndsAt) + 60);
  const executeTs = (await nowTs()) + 1; // next mined block
  await setNextTs(executeTs);
  const execTx = await governor.connect(employees[0]).execute(proposalId); // permissionless execution
  const rc = await execTx.wait();
  const applied = rc!.logs
    .map((l) => {
      try {
        return vault.interface.parseLog(l); // PackageApplied is a vault event
      } catch {
        return null;
      }
    })
    .find((l) => l != null && l.name === "PackageApplied");
  if (applied == null) throw new Error("PackageApplied event missing after execution");
  const effectiveFrom = BigInt(applied.args.effectiveFrom);
  const newBps = BigInt(applied.args.newRateBps);

  const p = await governor.getProposal(proposalId);
  line(`\n  tally: ${p.votesHigh} HIGH vs ${p.votesLow} LOW → quorum met → package APPLIED at block time ${effectiveFrom}`);
  line(`  wages earned in the two weeks BEFORE the vote: unchanged (never re-rated).`);
  line(`  new rate applies to FUTURE pay only, starting at the execution timestamp.`);

  // ── AFTER: two more weeks at the new rate ───────────────────────────────
  const afterTs = executeTs + Number(14n * DAY);
  await jumpTo(afterTs);

  rule();
  line(`\nAFTER THE VOTE — two more weeks, now streaming at ${Number(newBps) / 100}% of base`);
  rule();
  for (let i = 0; i < employees.length; i++) {
    const pre = baseRates[i] * (effectiveFrom - hireTs[i]);
    const post = (baseRates[i] * newBps) / 10_000n * (BigInt(afterTs) - effectiveFrom);
    const live = await vault.accruedOf(employees[i].address);
    check(live, pre + post, `${NAMES[i]} post-vote accrual`);
    check(await vault.effectiveRateOf(employees[i].address), (baseRates[i] * newBps) / 10_000n, `${NAMES[i]} new rate`);
    line(
      `  ${NAMES[i].padEnd(6)} earned ${usdc(pre).padStart(14)} @100% + ${usdc(post).padStart(14)} @150% = ${usdc(live).padStart(14)} total`,
    );
  }

  // ── SOLVENCY, HONESTLY ──────────────────────────────────────────────────
  rule();
  line("\nSOLVENCY, HONESTLY — the vote raised FUTURE pay; the vault says what that costs");
  rule();
  report = await vault.backingReport(RUNWAY_HORIZON_DAYS * DAY);
  line(`  liquid payroll balance:     ${usdc(report.liquidBalance)}`);
  line(`  vested but unwithdrawn:     ${usdc(report.vestedUnwithdrawn)}`);
  line(`  committed ${RUNWAY_HORIZON_DAYS}-day runway: ${usdc(report.futureRunway)}`);
  line(`  accruedBacked=${report.accruedBacked}  runwayBacked=${report.runwayBacked}  fullyBacked=${report.fullyBacked}`);
  line(`  → vested wages are ${report.accruedBacked ? "fully covered" : "UNDERFUNDED"};`);
  line(`  → the vote created a runway shortfall of ${usdc(report.runwayShortfall)} that only a payroll top-up can close.`);
  line(`  The vault will never pretend, and never print money it does not hold.`);

  const shortfall = report.runwayShortfall;
  if (shortfall > 0n) {
    // Fund the exact shortfall plus a one-day buffer — streaming payroll decays
    // its exact coverage every second, so a buffer keeps the report green.
    const currentStream = (sumBase * newBps) / 10_000n;
    const topUp = shortfall + currentStream * DAY;
    await (await working.connect(board).fundPayroll(topUp)).wait();
    line(`  board tops up payroll by ${usdc(topUp)} (shortfall + 1 day buffer)…`);
  }
  report = await vault.backingReport(RUNWAY_HORIZON_DAYS * DAY);
  if (!report.fullyBacked) throw new Error("post-top-up report should be fully backed");
  line(`  after top-up: fullyBacked=${report.fullyBacked} (liquid covers vested + runway exactly)`);

  // ── Pull wages ──────────────────────────────────────────────────────────
  const maya = employees[0];
  const mayaOwed = await vault.accruedOf(maya.address);
  const mayaBefore = await usdcToken.balanceOf(maya.address);
  const vaultBefore = await vault.liquidPayrollBalance();
  await (await vault.connect(maya).withdrawAll()).wait();
  line(`\nWITHDRAWAL — ${NAMES[0]} pulls every vested wage:`);
  line(`  paid out ${usdc(mayaOwed)}; wallet ${usdc(mayaBefore)} → ${usdc(await usdcToken.balanceOf(maya.address))}`);
  line(`  payroll vault ${usdc(vaultBefore)} → ${usdc(await vault.liquidPayrollBalance())}; her owed balance is now ${usdc(await vault.accruedOf(maya.address))}`);
  check((await vault.accruedOf(maya.address)), 0n, "withdrawAll drains owed");

  // ── Ring-fence: payroll is untouchable ──────────────────────────────────
  rule();
  line("\nRING-FENCE CHECKS — the board and treasury cannot touch payroll funds");
  rule();
  const payrollLiquid = await vault.liquidPayrollBalance();
  let boardReverted = false;
  try {
    await (await vault.connect(board).withdraw(1n)).wait();
  } catch (e) {
    boardReverted = true;
    line(`  board tries vault.withdraw(): reverted ✓ (${shortReason(e)})`);
  }
  if (!boardReverted) throw new Error("board withdraw should have reverted");
  check(await vault.liquidPayrollBalance(), payrollLiquid, "payroll untouched by board attempt");

  const vendorBefore = await usdcToken.balanceOf(vendor.address);
  await (await working.connect(board).spendTo(vendor.address, 5_000n * UNIT)).wait();
  line(`  board pays a vendor ${usdc(5_000n * UNIT)} from working capital — payroll stays ${usdc(await vault.liquidPayrollBalance())}`);
  check(await vault.liquidPayrollBalance(), payrollLiquid, "payroll untouched by vendor spend");

  // ── Closing ─────────────────────────────────────────────────────────────
  rule();
  line("\nWHAT JUST HAPPENED");
  rule();
  line("  • Employees chose the work-versus-pay tradeoff themselves, one person one vote —");
  line("    no token-weighted capital tilt, no board override.");
  line("  • The vote changed FUTURE pay only: every wage earned before execution kept its");
  line("    old rate, down to the second.");
  line("  • Wages live in a ring-fenced stablecoin vault: the treasury can fund it, but");
  line("    structurally cannot take anything back out — only earning employees can pull.");
  line("  • The backing report never conflates 'accrued covered' with 'fully backed' —");
  line("    the runway shortfall after the vote was public, then closed by an explicit");
  line("    one-way payroll top-up.");
  rule();
}

function shortReason(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const idx = msg.indexOf("reverted with custom error");
  return (idx >= 0 ? msg.slice(idx) : msg).slice(0, 120);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
