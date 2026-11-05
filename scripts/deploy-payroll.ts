/**
 * Deploys the employee-governed payroll DAO track:
 *
 *   MockUSDC (payment stablecoin)
 *   ├── PayrollVault        — ring-fenced payroll, per-second streaming
 *   ├── PayrollGovernor     — one-person-one-vote over future work packages
 *   └── WorkingCapitalVault — company treasury; funds payroll one-way only
 *
 * Seeds a demo company: a board wallet, five employees with realistic base
 * salaries, and a payroll vault fully backed for 60 days of runway at the
 * initial 100% package.
 *
 * Usage: npx hardhat run scripts/deploy-payroll.ts --network localhost
 * Writes deployments/payroll-<network>.json with all addresses.
 */
import { ethers, network } from "hardhat";
import * as fs from "node:fs";
import * as path from "node:path";

const UNIT = 1_000_000n; // 6 decimals
const DAY = 86_400n;
const SECONDS_PER_YEAR = 31_536_000;
const VOTING_PERIOD_SECONDS = 3 * 86_400n; // three days to vote
const QUORUM_BPS = 4_000n; // 40% of the employee snapshot must vote
const INITIAL_PACKAGE_BPS = 10_000n; // start everyone at 100% of base
const RUNWAY_DAYS_FUNDED = 60n;

const EMPLOYEE_SALARIES_USD = [140_000, 110_000, 95_000, 78_000, 62_000];

async function main() {
  const [deployer, board, ...staff] = await ethers.getSigners();
  const employees = staff.slice(0, EMPLOYEE_SALARIES_USD.length);
  if (employees.length < EMPLOYEE_SALARIES_USD.length) {
    throw new Error("Need at least 6 unlocked signers (deployer, board, 4+ employees).");
  }

  console.log(`Deploying payroll DAO track on network "${network.name}"…`);
  console.log(`  deployer: ${deployer.address}`);
  console.log(`  board:    ${board.address}`);

  const usdc = await (await ethers.getContractFactory("MockUSDC")).deploy();
  await usdc.waitForDeployment();

  const vault = await (await ethers.getContractFactory("PayrollVault")).deploy(
    usdc.target,
    board.address,
    INITIAL_PACKAGE_BPS,
  );
  await vault.waitForDeployment();

  const governor = await (await ethers.getContractFactory("PayrollGovernor")).deploy(
    vault.target,
    board.address,
    VOTING_PERIOD_SECONDS,
    QUORUM_BPS,
  );
  await governor.waitForDeployment();

  await (await vault.connect(board).setGovernor(governor.target)).wait();

  const working = await (await ethers.getContractFactory("WorkingCapitalVault")).deploy(
    usdc.target,
    board.address,
    vault.target,
  );
  await working.waitForDeployment();

  // Seed the treasury, then hire the demo company.
  await (await usdc.mint(board.address, 1_000_000n * UNIT)).wait();
  await (await usdc.connect(board).approve(working.target, ethers.MaxUint256)).wait();
  await (await working.connect(board).deposit(600_000n * UNIT)).wait();

  const baseRates = EMPLOYEE_SALARIES_USD.map(
    (salaryUsd) => BigInt(Math.floor((salaryUsd * 1e6) / SECONDS_PER_YEAR)),
  );
  let ts = Number((await ethers.provider.getBlock("latest"))!.timestamp) + 10;
  const hired: { address: string; annualUsdTarget: number; baseRatePerSecond: string }[] = [];
  for (let i = 0; i < employees.length; i++) {
    await ethers.provider.send("evm_setNextBlockTimestamp", [ts + i]);
    await (await vault.connect(board).hire(employees[i].address, baseRates[i])).wait();
    hired.push({
      address: employees[i].address,
      annualUsdTarget: EMPLOYEE_SALARIES_USD[i],
      baseRatePerSecond: baseRates[i].toString(),
    });
  }

  // Back the full committed runway at the initial 100% package — visibly solvent from day one.
  const sumBase = baseRates.reduce((a, b) => a + b, 0n);
  const runwayAmount = sumBase * RUNWAY_DAYS_FUNDED * DAY;
  await (await working.connect(board).fundPayroll(runwayAmount)).wait();

  const deployedAt = new Date().toISOString();
  const output = {
    network: network.name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    deployedAt,
    description: "Employee-governed payroll DAO (ring-fenced PayrollVault + PayrollGovernor + WorkingCapitalVault)",
    contracts: {
      mockUsdc: usdc.target,
      payrollVault: vault.target,
      payrollGovernor: governor.target,
      workingCapitalVault: working.target,
    },
    params: {
      votingPeriodSeconds: VOTING_PERIOD_SECONDS.toString(),
      quorumBps: QUORUM_BPS.toString(),
      initialPackageBps: INITIAL_PACKAGE_BPS.toString(),
      runwayDaysFunded: RUNWAY_DAYS_FUNDED.toString(),
    },
    board: board.address,
    employees: hired,
    payrollFunding: { amount: runwayAmount.toString(), coversDays: RUNWAY_DAYS_FUNDED.toString() },
  };

  const file = path.join(__dirname, "..", "deployments", `payroll-${network.name}.json`);
  fs.writeFileSync(file, JSON.stringify(output, null, 2) + "\n");

  console.log("\nPayroll DAO deployed:");
  console.log(`  MockUSDC:              ${usdc.target}`);
  console.log(`  PayrollVault:          ${vault.target}`);
  console.log(`  PayrollGovernor:       ${governor.target}`);
  console.log(`  WorkingCapitalVault:   ${working.target}`);
  console.log(`  payroll backing:       ${runwayAmount} base units (${RUNWAY_DAYS_FUNCED_DISPLAY(runwayAmount)} days at 100%)`);
  console.log(`  addresses written to:  ${file}`);
}

function RUNWAY_DAYS_FUNCED_DISPLAY(amount: bigint): string {
  return (Number(amount) / 1e6).toFixed(0);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
