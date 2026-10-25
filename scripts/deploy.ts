import hre from "hardhat";
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

export async function deployAll(networkName: string = "local") {
  console.log(`\n🚀 Deploying AegisDAO IntentLock contracts to [${networkName}]...`);

  const [deployer, guardian, verifier] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();

  console.log(`  Deployer: ${deployer.address}`);
  console.log(`  Guardian: ${guardian.address}`);
  console.log(`  Verifier: ${verifier.address}`);
  console.log(`  Chain ID: ${net.chainId}`);

  // 1. Mock Tokens
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy();
  await usdc.waitForDeployment();
  const usdcAddr = await usdc.getAddress();
  console.log(`  ✔ MockUSDC:           ${usdcAddr}`);

  const MockToken = await ethers.getContractFactory("MockUSDC");
  const votingToken = await MockToken.deploy();
  await votingToken.waitForDeployment();
  const votingTokenAddr = await votingToken.getAddress();
  console.log(`  ✔ GovernanceToken:    ${votingTokenAddr}`);

  // 2. Proposal Registry
  const ProposalRegistry = await ethers.getContractFactory("ProposalRegistry");
  const registry = await ProposalRegistry.deploy();
  await registry.waitForDeployment();
  const registryAddr = await registry.getAddress();
  console.log(`  ✔ ProposalRegistry:   ${registryAddr}`);

  // 3. Disclosure Registry
  const challengeWindow = 2 * 86400; // 2 days
  const challengeExtension = 3 * 86400; // 3 days
  const DisclosureRegistry = await ethers.getContractFactory("DisclosureRegistry");
  const disclosureRegistry = await DisclosureRegistry.deploy(
    verifier.address,
    challengeWindow,
    challengeExtension
  );
  await disclosureRegistry.waitForDeployment();
  const disclosureAddr = await disclosureRegistry.getAddress();
  console.log(`  ✔ DisclosureRegistry: ${disclosureAddr}`);

  // 4. IntentLockExecutor
  const minDelay = 3600; // 1 hour
  const maxDelay = 14 * 86400; // 14 days
  const IntentLockExecutor = await ethers.getContractFactory("IntentLockExecutor");
  const executor = await IntentLockExecutor.deploy(
    registryAddr,
    guardian.address,
    deployer.address, // temporary governor
    minDelay,
    maxDelay
  );
  await executor.waitForDeployment();
  const executorAddr = await executor.getAddress();
  console.log(`  ✔ IntentLockExecutor: ${executorAddr}`);

  // 5. IntentGovernor
  const votingPeriod = 3 * 86400; // 3 days
  const quorum = ethers.parseEther("1000");
  const IntentGovernor = await ethers.getContractFactory("IntentGovernor");
  const governor = await IntentGovernor.deploy(
    votingTokenAddr,
    registryAddr,
    disclosureAddr,
    executorAddr,
    votingPeriod,
    quorum,
    minDelay
  );
  await governor.waitForDeployment();
  const governorAddr = await governor.getAddress();
  console.log(`  ✔ IntentGovernor:     ${governorAddr}`);

  // Set real governor on executor
  await (executor as any).setGovernor(governorAddr);
  console.log(`  ✔ Executor governor updated to IntentGovernor`);

  // 6. Test helpers / demo contracts
  const FeeModule = await ethers.getContractFactory("FeeModule");
  const feeModule = await FeeModule.deploy(30, executorAddr);
  await feeModule.waitForDeployment();
  const feeModuleAddr = await feeModule.getAddress();
  console.log(`  ✔ FeeModule:          ${feeModuleAddr}`);

  const TreasuryProxy = await ethers.getContractFactory("TreasuryProxy");
  const treasuryProxy = await TreasuryProxy.deploy(executorAddr, feeModuleAddr);
  await treasuryProxy.waitForDeployment();
  const treasuryAddr = await treasuryProxy.getAddress();
  console.log(`  ✔ TreasuryProxy:      ${treasuryAddr}`);

  const MaliciousImpl = await ethers.getContractFactory("MaliciousImpl");
  const maliciousImpl = await MaliciousImpl.deploy(deployer.address);
  await maliciousImpl.waitForDeployment();
  const maliciousImplAddr = await maliciousImpl.getAddress();
  console.log(`  ✔ MaliciousImpl:      ${maliciousImplAddr}`);

  const ReentrantRecipient = await ethers.getContractFactory("ReentrantRecipient");
  const reentrantRecipient = await ReentrantRecipient.deploy(executorAddr);
  await reentrantRecipient.waitForDeployment();
  const reentrantAddr = await reentrantRecipient.getAddress();
  console.log(`  ✔ ReentrantRecipient: ${reentrantAddr}`);

  const VulnerableProxy = await ethers.getContractFactory("VulnerableProxy");
  const vulnerableProxy = await VulnerableProxy.deploy(executorAddr, feeModuleAddr);
  await vulnerableProxy.waitForDeployment();
  const vulnerableAddr = await vulnerableProxy.getAddress();
  console.log(`  ✔ VulnerableProxy:    ${vulnerableAddr}`);

  // Seed funds
  await usdc.mint(executorAddr, 500_000n * 1_000_000n); // 500,000 USDC in executor
  await usdc.mint(treasuryAddr, 1_000_000n * 1_000_000n); // 1,000,000 USDC in treasury

  // Collect ABIs and write output
  const deploymentData = {
    network: networkName,
    chainId: Number(net.chainId),
    deployedAt: new Date().toISOString(),
    contracts: {
      MockUSDC: {
        address: usdcAddr,
        abi: MockUSDC.interface.formatJson(),
      },
      GovernanceToken: {
        address: votingTokenAddr,
        abi: MockToken.interface.formatJson(),
      },
      ProposalRegistry: {
        address: registryAddr,
        abi: ProposalRegistry.interface.formatJson(),
      },
      DisclosureRegistry: {
        address: disclosureAddr,
        abi: DisclosureRegistry.interface.formatJson(),
      },
      IntentLockExecutor: {
        address: executorAddr,
        abi: IntentLockExecutor.interface.formatJson(),
      },
      IntentGovernor: {
        address: governorAddr,
        abi: IntentGovernor.interface.formatJson(),
      },
      FeeModule: {
        address: feeModuleAddr,
        abi: FeeModule.interface.formatJson(),
      },
      TreasuryProxy: {
        address: treasuryAddr,
        abi: TreasuryProxy.interface.formatJson(),
      },
      MaliciousImpl: {
        address: maliciousImplAddr,
        abi: MaliciousImpl.interface.formatJson(),
      },
      ReentrantRecipient: {
        address: reentrantAddr,
        abi: ReentrantRecipient.interface.formatJson(),
      },
      VulnerableProxy: {
        address: vulnerableAddr,
        abi: VulnerableProxy.interface.formatJson(),
      },
    },
  };

  const outDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const outPath = path.join(outDir, `${networkName}.json`);
  fs.writeFileSync(outPath, JSON.stringify(deploymentData, null, 2), "utf8");
  console.log(`\n💾 Saved deployment manifest to: ${outPath}`);

  return deploymentData;
}

if (require.main === module) {
  deployAll("local")
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
