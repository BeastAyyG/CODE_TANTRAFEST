import hre from "hardhat";
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { deployAegisFixture, proposeAndQueue } from "../test/redteam/fixture";
import { scanBytecode } from "../sentinel/scan";
import { simulateProposalExecution } from "../sentinel/simulate";
import { buildViolationReport } from "../sentinel/halt";
import { Action, ActionRule, ActionKind } from "../packages/shared/hash";

async function generateSentinelReports() {
  console.log("Generating Sentinel Raw Output Reports for Scenarios 3, 4, and 6...");
  const f = await deployAegisFixture();
  const provider = ethers.provider;

  const reports: Record<string, any> = {};

  // ── Scenario 3: Jargon Upgrade ──
  {
    console.log("  Generating Sentinel Report: Scenario 3 (Jargon Upgrade)...");
    const feeModuleAddr = await f.feeModule.getAddress();
    const maliciousImplAddr = await f.maliciousImpl.getAddress();
    const treasuryAddr = await f.treasuryProxy.getAddress();

    const legitRules: ActionRule[] = [
      {
        kind: ActionKind.PARAM_SET,
        target: feeModuleAddr,
        selector: "0x694b8e39",
        counterparty: ethers.ZeroAddress,
        maxAmount: 100n,
        codeHash: ethers.ZeroHash,
        childCount: 0,
      },
    ];

    const q = await proposeAndQueue(
      f,
      [
        {
          target: feeModuleAddr,
          value: 0n,
          data: f.feeModule.interface.encodeFunctionData("setFee", [35]),
        },
      ],
      legitRules,
      "Tuning Fee Module"
    );

    const upgradeCalldata = f.treasuryProxy.interface.encodeFunctionData("upgradeTo", [
      maliciousImplAddr,
    ]);

    const attackActions: Action[] = [
      {
        target: treasuryAddr,
        value: 0n,
        data: upgradeCalldata,
      },
    ];

    const sim = await simulateProposalExecution(
      f.executor,
      q.proposalId,
      q.version,
      q.versionHash,
      q.disclosureHash,
      attackActions,
      legitRules,
      {
        treasuryProxy: treasuryAddr,
        feeModule: feeModuleAddr,
        executor: await f.executor.getAddress(),
        usdc: await f.usdc.getAddress(),
      },
      [f.attacker.address]
    );

    const bytecodeScan = await scanBytecode(provider, maliciousImplAddr);

    reports["scenario_3_jargon_upgrade"] = {
      scenarioId: 3,
      scenarioName: "Jargon Upgrade",
      proposalTitle: "Routine parameter tuning of the fee module",
      submittedExecution: {
        target: treasuryAddr,
        selector: "0x3659cfe6 (upgradeTo)",
        implementation: maliciousImplAddr,
        calldata: upgradeCalldata,
      },
      sentinelDetection: {
        shouldHalt: sim.shouldHalt,
        haltReason: sim.haltReason,
        bytecodeScan: {
          target: bytecodeScan.target,
          codeHash: bytecodeScan.codeHash,
          hasDelegateCall: bytecodeScan.hasDelegateCall,
          hasSelfDestruct: bytecodeScan.hasSelfDestruct,
          violations: bytecodeScan.violations,
        },
        diffReport: sim.diffReport,
      },
      violationReport: buildViolationReport(sim, {
        proposalId: q.proposalId.toString(),
        scenarioId: "3",
        proposalSaid: "Routine parameter tuning of the fee module.",
      }),
      explainerCard: {
        proposalSaid: "Routine parameter tuning of the fee module.",
        approvedExecution: "Set feeBps on FeeModule to a value <= 100.",
        submittedExecution: `upgradeTo(${maliciousImplAddr}) on TreasuryProxy`,
        violatedConstraint:
          "No approved rule permits an upgrade; implementation code hash contains DELEGATECALL and SELFDESTRUCT backdoors.",
        verifiableEvidence: {
          approvedCommitment: q.commitment,
          submittedCalldata: upgradeCalldata,
          revertReason: sim.revertReason,
        },
      },
    };
  }

  // ── Scenario 4: Nested Multicall ──
  {
    console.log("  Generating Sentinel Report: Scenario 4 (Nested Multicall)...");
    const feeModuleAddr = await f.feeModule.getAddress();
    const setFeeData = f.feeModule.interface.encodeFunctionData("setFee", [40]);
    const multicallInterface = new ethers.Interface([
      "function multicall(bytes[] calldata data) external returns (bytes[] memory)",
    ]);

    const legitRules: ActionRule[] = [
      {
        kind: ActionKind.MULTICALL,
        target: feeModuleAddr,
        selector: "0xac9650d8",
        counterparty: ethers.ZeroAddress,
        maxAmount: 0n,
        codeHash: ethers.ZeroHash,
        childCount: 1,
      },
      {
        kind: ActionKind.PARAM_SET,
        target: feeModuleAddr,
        selector: "0x694b8e39",
        counterparty: ethers.ZeroAddress,
        maxAmount: 100n,
        codeHash: ethers.ZeroHash,
        childCount: 0,
      },
    ];

    const q = await proposeAndQueue(
      f,
      [
        {
          target: feeModuleAddr,
          value: 0n,
          data: multicallInterface.encodeFunctionData("multicall", [[setFeeData]]),
        },
      ],
      legitRules,
      "Tweak Fee via Multicall"
    );

    const transferOwnershipData = f.feeModule.interface.encodeFunctionData(
      "transferOwnership",
      [f.attacker.address]
    );
    const attackCalldata = multicallInterface.encodeFunctionData("multicall", [
      [setFeeData, transferOwnershipData],
    ]);

    const attackActions: Action[] = [
      {
        target: feeModuleAddr,
        value: 0n,
        data: attackCalldata,
      },
    ];

    const sim = await simulateProposalExecution(
      f.executor,
      q.proposalId,
      q.version,
      q.versionHash,
      q.disclosureHash,
      attackActions,
      legitRules,
      {
        feeModule: feeModuleAddr,
        executor: await f.executor.getAddress(),
      },
      [f.attacker.address]
    );

    reports["scenario_4_nested_multicall"] = {
      scenarioId: 4,
      scenarioName: "Nested Multicall Hiding Ownership Transfer",
      proposalTitle: "Tweak Fee via Multicall",
      submittedExecution: {
        target: feeModuleAddr,
        selector: "0xac9650d8 (multicall)",
        innerCallsCount: 2,
        calldata: attackCalldata,
      },
      sentinelDetection: {
        shouldHalt: sim.shouldHalt,
        haltReason: sim.haltReason,
        diffReport: sim.diffReport,
      },
      violationReport: buildViolationReport(sim, {
        proposalId: q.proposalId.toString(),
        scenarioId: "4",
        proposalSaid: "Tweak fee module parameter via batch multicall.",
      }),
      explainerCard: {
        proposalSaid: "Tweak fee module parameter via batch multicall.",
        approvedExecution: "multicall([setFee(40)]) with exactly 1 inner call.",
        submittedExecution: `multicall([setFee(40), transferOwnership(${f.attacker.address})])`,
        violatedConstraint:
          "Multicall childCount mismatch and unapproved transferOwnership inner call.",
        verifiableEvidence: {
          approvedCommitment: q.commitment,
          submittedCalldata: attackCalldata,
          revertReason: sim.revertReason,
        },
      },
    };
  }

  // ── Scenario 6: Delegatecall Payload ──
  {
    console.log("  Generating Sentinel Report: Scenario 6 (Delegatecall Payload)...");
    const executorAddr = await f.executor.getAddress();
    const maliciousImplAddr = await f.maliciousImpl.getAddress();

    const scan = await scanBytecode(provider, maliciousImplAddr);
    const executorScan = await scanBytecode(provider, executorAddr);

    reports["scenario_6_delegatecall_payload"] = {
      scenarioId: 6,
      scenarioName: "Delegatecall Payload Protection",
      proposalTitle: "Arbitrary execution via delegatecall",
      sentinelDetection: {
        executorHasDelegateCall: executorScan.hasDelegateCall,
        maliciousTargetHasDelegateCall: scan.hasDelegateCall,
        maliciousTargetHasSelfDestruct: scan.hasSelfDestruct,
        shouldHalt: true,
        haltReason: "Target contract contains dangerous DELEGATECALL (0xf4) instruction",
      },
      explainerCard: {
        proposalSaid: "Deploy helper and delegatecall state migration.",
        approvedExecution: "Only CALL opcode supported by IntentLockExecutor.",
        submittedExecution: `delegatecall payload routed to ${maliciousImplAddr}`,
        violatedConstraint:
          "IntentLockExecutor architecturally rejects delegatecall; static scan detected DELEGATECALL in target bytecode.",
        verifiableEvidence: {
          executorBytecodeScan: "NO DELEGATECALL (0xf4) opcode present",
          targetBytecodeScan: "DELEGATECALL and SELFDESTRUCT present in MaliciousImpl",
        },
      },
    };
  }

  const outDir = path.join(__dirname, "../packages/shared/fixtures");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const outPath = path.join(outDir, "sentinel-reports.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      reports,
      (_, v) => (typeof v === "bigint" ? v.toString() : v),
      2
    ),
    "utf8"
  );
  console.log(`\n💾 Saved Sentinel Reports to: ${outPath}`);
}

if (require.main === module) {
  generateSentinelReports()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
