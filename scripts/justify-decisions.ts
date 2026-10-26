// scripts/justify-decisions.ts
//
// AegisDAO IntentLock: on-chain accept / reject justification report.
//
// For each case this script queues a candidate bundle on the REAL
// IntentLockExecutor contract, then attempts execution and prints the
// verdict the CHAIN returns: ACCEPTED (executed on-chain) or REJECTED
// (the exact custom error and its arguments as justification).
// Nothing here is a TypeScript model: every verdict comes from the contract.
//
// Mechanics the script relies on (verified against contracts/):
// - queue(proposalId, version, versionHash, actionsHash, intentHash,
//   disclosureHash, delay) binds a bundle; only the governor may queue.
// - execute(proposalId, version, versionHash, disclosureHash, actions, rules)
//   recomputes actionsHash and intentHash, requires the recomputed commitment
//   to be Queued, the timelock to have expired, the version to still be
//   latest, and every action to satisfy its rule via ActionDecoder.
// - intentHash = keccak256(abi.encode(rules))
// - actionsHash: leaf = keccak256(abi.encode(target, value, keccak256(data))),
//   actionsHash = keccak256(abi.encodePacked(leaves))
//
// How to read the cases:
// - Case 1 is the voted AIP-042 bundle. It must ACCEPT.
// - Cases 2-5 and 9-11 queue a bundle that breaks one restriction and show
//   the executor refusing it at execution time, with the reason.
// - Case 6 queues the voted bundle but submits a different one: the
//   recomputed commitment is not Queued, so execution is refused before
//   any rule is even checked. That is the voted-vs-submitted mismatch.
// - Cases 7-8 break the timelock and the version-freshness gates.
//
// Run: npx hardhat run scripts/justify-decisions.ts
// (in-process Hardhat Network; no external node needed)

import hre from "hardhat";

const ethers = hre.ethers;
const abi = ethers.AbiCoder.defaultAbiCoder();
const ZERO = ethers.ZeroHash;

// ActionKind in contracts/libs/ActionDecoder.sol, in order.
const Kind = {
  TRANSFER: 0,
  APPROVE: 1,
  PARAM_SET: 2,
  UPGRADE: 3,
  OWNERSHIP: 4,
  MULTICALL: 5,
};

type Action = { target: string; value: bigint; data: string };
type Rule = [number, string, string, string, bigint, string, number];

function rule(
  kind: number,
  target: string,
  selector: string,
  counterparty: string,
  maxAmount: bigint,
  codeHash: string = ZERO,
  childCount = 0,
): Rule {
  return [kind, target, selector, counterparty, maxAmount, codeHash, childCount];
}

function hashActions(actions: Action[]): string {
  const leaves = actions.map((a) =>
    ethers.keccak256(
      abi.encode(
        ["address", "uint256", "bytes32"],
        [a.target, a.value, ethers.keccak256(a.data)],
      ),
    ),
  );
  return ethers.keccak256(ethers.concat(leaves));
}

function hashRules(rules: Rule[]): string {
  return ethers.keccak256(
    abi.encode(
      ["tuple(uint8,address,bytes4,address,uint256,bytes32,uint8)[]"],
      [rules],
    ),
  );
}

// Every custom error the executor path can revert with.
const ERROR_IFACE = new ethers.Interface([
  "error SelectorNotAllowed(bytes4 expected, bytes4 actual)",
  "error UnauthorizedRecipient(address expected, address actual)",
  "error ExceedsSpendLimit(uint256 maxAllowed, uint256 actual)",
  "error UnlimitedApprovalNotCommitted(address spender)",
  "error UnauthorizedImplementation(address expected, address actual)",
  "error CodeHashMismatch(bytes32 expected, bytes32 actual)",
  "error UnauthorizedNewOwner(address expected, address actual)",
  "error MulticallChildCountMismatch(uint8 expected, uint256 actual)",
  "error MulticallDepthExceeded(uint256 depth)",
  "error UnauthorizedTarget(address expected, address actual)",
  "error UnknownActionKind(uint8 kind)",
  "error BadCalldataLength(uint256 expected, uint256 actual)",
  "error TimelockNotExpired(uint256 eta, uint256 currentTime)",
  "error VersionSuperseded(uint256 proposalId, bytes32 currentLatest, bytes32 votedVersion)",
  "error ProposalNotInState(uint8 expected, uint8 actual)",
  "error RuleLengthMismatch(uint256 actionsLength, uint256 rulesLength)",
  "error CommitmentMismatch(bytes32 expected, bytes32 actual)",
  "error IntentHashMismatch(bytes32 expected, bytes32 actual)",
  "error DelayOutOfRange(uint256 delay, uint256 min, uint256 max)",
  "error AlreadyQueued(bytes32 commitment)",
  "error NotGovernor(address caller)",
  "error NotQueued(bytes32 commitment)",
  "error ActionExecutionFailed(uint256 actionIndex, address target, bytes returnData)",
  "error PostConditionFailed(string check, bytes data)",
]);

function decodeRevert(err: any): string {
  const candidates: any[] = [
    err?.data,
    err?.error?.data,
    err?.info?.error?.data,
  ];
  for (const data of candidates) {
    if (typeof data === "string" && data.startsWith("0x")) {
      try {
        const parsed = ERROR_IFACE.parseError(data);
        if (parsed) return `${parsed.name}(${parsed.args.map(String).join(", ")})`;
      } catch {
        // fall through to message scan
      }
    }
  }
  const message = String(err?.message ?? err);
  const hex = message.match(/0x[0-9a-fA-F]{8}[0-9a-fA-F]*/);
  if (hex) {
    try {
      const parsed = ERROR_IFACE.parseError(hex[0]);
      if (parsed) return `${parsed.name}(${parsed.args.map(String).join(", ")})`;
    } catch {
      // fall through
    }
  }
  for (const name of [
    "SelectorNotAllowed",
    "UnauthorizedRecipient",
    "ExceedsSpendLimit",
    "UnlimitedApprovalNotCommitted",
    "UnauthorizedImplementation",
    "CodeHashMismatch",
    "UnauthorizedNewOwner",
    "MulticallChildCountMismatch",
    "UnauthorizedTarget",
    "TimelockNotExpired",
    "VersionSuperseded",
    "ProposalNotInState",
    "RuleLengthMismatch",
    "CommitmentMismatch",
    "IntentHashMismatch",
  ]) {
    if (message.includes(name)) return `${name} (arguments not decoded)`;
  }
  return `undecoded revert: ${message.slice(0, 200)}`;
}

type Ctx = {
  registry: any;
  executor: any;
  usdc: any;
  proxy: any;
  deployer: any;
  growthLabs: any;
  guild: any;
  treasuryOps: any;
  stranger: any;
  expectedOwner: any;
  implA: string;
  implB: string;
  implACodeHash: string;
};

async function runCase(
  ctx: Ctx,
  n: number,
  title: string,
  said: string,
  submitted: string,
  rules: Rule[],
  committed: Action[],
  submittedActions: Action[],
  opts: { delay?: number; supersede?: boolean; expectAccept: boolean },
): Promise<boolean> {
  const { registry, executor } = ctx;
  const intentHash = hashRules(rules);
  const contentHash = ethers.keccak256(ethers.toUtf8Bytes(`justify:${title}`));
  const disclosureHash = ethers.keccak256(ethers.toUtf8Bytes("disclosure:AIP-042"));

  // Fresh proposal per case so commitments never collide.
  // NOTE: do NOT read proposalId/versionHash from a staticCall: the
  // registry hashes block.timestamp into the version, so a simulated
  // call and the mined transaction disagree and every later check
  // fails with VersionSuperseded. Read them from chain state instead.
  const proposalId = await registry.nextProposalId();
  await registry.createProposal(
    contentHash,
    ZERO,
    ZERO,
    ZERO,
    intentHash,
    disclosureHash,
  );
  const versionHash = await registry.latestVersionHash(proposalId);

  const actionsHash = hashActions(committed);
  const delay = opts.delay ?? 0;
  await executor.queue(
    proposalId,
    1,
    versionHash,
    actionsHash,
    intentHash,
    disclosureHash,
    delay,
  );

  if (opts.supersede) {
    // Amending creates a newer latest version, so the queued v1 is stale.
    await registry.addVersion(
      proposalId,
      ethers.keccak256(ethers.toUtf8Bytes(`justify:${title}:v2`)),
      ZERO,
      ZERO,
      ZERO,
      intentHash,
      disclosureHash,
    );
  }

  let verdict: string;
  let ok: boolean;
  try {
    await executor.execute.staticCall(
      proposalId,
      1,
      versionHash,
      disclosureHash,
      submittedActions,
      rules,
    );
    const tx = await executor.execute(
      proposalId,
      1,
      versionHash,
      disclosureHash,
      submittedActions,
      rules,
    );
    await tx.wait();
    verdict = "ACCEPTED (executed on-chain)";
    ok = true;
  } catch (e) {
    verdict = `REJECTED: ${decodeRevert(e)}`;
    ok = false;
  }

  const match = ok === opts.expectAccept ? "as expected" : "UNEXPECTED";
  console.log(`\n[${n}] ${title}`);
  console.log(`    Proposal said: ${said}`);
  console.log(`    Submitted:     ${submitted}`);
  console.log(`    Verdict:       ${verdict} [${match}]`);
  return ok === opts.expectAccept;
}

async function main() {
  const [deployer, growthLabs, guild, treasuryOps, stranger, expectedOwner] =
    await ethers.getSigners();

  const usdc = await (await ethers.getContractFactory("MockUSDC")).deploy();
  await usdc.waitForDeployment();
  const registry = await (
    await ethers.getContractFactory("ProposalRegistry")
  ).deploy();
  await registry.waitForDeployment();
  const executor = await (
    await ethers.getContractFactory("IntentLockExecutor")
  ).deploy(
    await registry.getAddress(),
    deployer.address, // guardian
    deployer.address, // governor (this script queues)
    0, // minDelay
    7200, // maxDelay
  );
  await executor.waitForDeployment();

  // Second and third token deployments stand in for two implementation
  // contracts with identical bytecode but different addresses.
  const implTokenA = await (await ethers.getContractFactory("MockUSDC")).deploy();
  await implTokenA.waitForDeployment();
  const implTokenB = await (await ethers.getContractFactory("MockUSDC")).deploy();
  await implTokenB.waitForDeployment();
  const implA = await implTokenA.getAddress();
  const implB = await implTokenB.getAddress();
  const implACodeHash = ethers.keccak256(
    await ethers.provider.getCode(implA),
  );

  const proxy = await (
    await ethers.getContractFactory("TreasuryProxy")
  ).deploy(await executor.getAddress(), implA);
  await proxy.waitForDeployment();

  // The executor holds the treasury funds it will move on ACCEPT.
  await usdc.mint(await executor.getAddress(), ethers.parseUnits("1000000", 6));

  const usdcAddr = await usdc.getAddress();
  const proxyAddr = await proxy.getAddress();
  const transferSel = usdc.interface.getFunction("transfer").selector;
  const approveSel = usdc.interface.getFunction("approve").selector;
  const upgradeSel = "0x3659cfe6"; // upgradeTo(address)
  const ownershipSel = "0xf2fde38b"; // transferOwnership(address)

  const u = (n: string) => ethers.parseUnits(n, 6);
  const ctx: Ctx = {
    registry,
    executor,
    usdc,
    proxy,
    deployer,
    growthLabs,
    guild,
    treasuryOps,
    stranger,
    expectedOwner,
    implA,
    implB,
    implACodeHash,
  };

  // The voted AIP-042 restrictions: 200k to GrowthLabs, 50k to Developer
  // Guild, 5k bounded allowance to TreasuryOps. Nothing else.
  const aipRules: Rule[] = [
    rule(Kind.TRANSFER, usdcAddr, transferSel, growthLabs.address, u("200000")),
    rule(Kind.TRANSFER, usdcAddr, transferSel, guild.address, u("50000")),
    rule(Kind.APPROVE, usdcAddr, approveSel, treasuryOps.address, u("5000")),
  ];
  const aipActions: Action[] = [
    {
      target: usdcAddr,
      value: 0n,
      data: usdc.interface.encodeFunctionData("transfer", [
        growthLabs.address,
        u("200000"),
      ]),
    },
    {
      target: usdcAddr,
      value: 0n,
      data: usdc.interface.encodeFunctionData("transfer", [
        guild.address,
        u("50000"),
      ]),
    },
    {
      target: usdcAddr,
      value: 0n,
      data: usdc.interface.encodeFunctionData("approve", [
        treasuryOps.address,
        u("5000"),
      ]),
    },
  ];

  const results: boolean[] = [];
  const transfer = (to: string, amount: bigint): Action => ({
    target: usdcAddr,
    value: 0n,
    data: usdc.interface.encodeFunctionData("transfer", [to, amount]),
  });
  const approve = (to: string, amount: bigint): Action => ({
    target: usdcAddr,
    value: 0n,
    data: usdc.interface.encodeFunctionData("approve", [to, amount]),
  });

  results.push(
    await runCase(
      ctx,
      1,
      "Exact voted bundle",
      "200k USDC to GrowthLabs, 50k to Developer Guild, 5k allowance to TreasuryOps.",
      "Same three calls, same amounts, same recipients.",
      aipRules,
      aipActions,
      aipActions,
      { expectAccept: true },
    ),
  );

  results.push(
    await runCase(
      ctx,
      2,
      "Wrong function on the right contract",
      "Only transfer() calls on USDC are committed.",
      "approve() call submitted against the transfer rule.",
      [aipRules[0]],
      [approve(treasuryOps.address, u("5000"))],
      [approve(treasuryOps.address, u("5000"))],
      { expectAccept: false },
    ),
  );

  results.push(
    await runCase(
      ctx,
      3,
      "Uncommitted recipient",
      "200k USDC to GrowthLabs only.",
      "200k USDC to an undisclosed wallet.",
      [aipRules[0]],
      [transfer(stranger.address, u("200000"))],
      [transfer(stranger.address, u("200000"))],
      { expectAccept: false },
    ),
  );

  results.push(
    await runCase(
      ctx,
      4,
      "Amount above the ceiling",
      "At most 200k USDC to GrowthLabs.",
      "900k USDC to GrowthLabs.",
      [aipRules[0]],
      [transfer(growthLabs.address, u("900000"))],
      [transfer(growthLabs.address, u("900000"))],
      { expectAccept: false },
    ),
  );

  results.push(
    await runCase(
      ctx,
      5,
      "Unbounded allowance",
      "At most a 5k USDC allowance to TreasuryOps.",
      "Unlimited (type(uint256).max) allowance to TreasuryOps.",
      [aipRules[2]],
      [approve(treasuryOps.address, ethers.MaxUint256)],
      [approve(treasuryOps.address, ethers.MaxUint256)],
      { expectAccept: false },
    ),
  );

  results.push(
    await runCase(
      ctx,
      6,
      "Submitted bundle is not the voted bundle",
      "The vote committed to the three-call AIP-042 bundle.",
      "One upgradeTo() call on the treasury proxy instead of that bundle.",
      aipRules,
      aipActions,
      [
        {
          target: proxyAddr,
          value: 0n,
          data: proxy.interface.encodeFunctionData("upgradeTo", [implB]),
        },
      ],
      { expectAccept: false },
    ),
  );

  results.push(
    await runCase(
      ctx,
      7,
      "Timelock has not expired",
      "Execution only after the queued delay.",
      "Exact bundle submitted immediately after queueing with a 3600s delay.",
      aipRules,
      aipActions,
      aipActions,
      { delay: 3600, expectAccept: false },
    ),
  );

  results.push(
    await runCase(
      ctx,
      8,
      "Voted version was superseded",
      "Execution binds to the latest version only.",
      "Exact v1 bundle submitted after a v2 amendment was added.",
      aipRules,
      aipActions,
      aipActions,
      { supersede: true, expectAccept: false },
    ),
  );

  const upgradeRule: Rule[] = [
    rule(Kind.UPGRADE, proxyAddr, upgradeSel, implA, 0n, implACodeHash),
  ];
  results.push(
    await runCase(
      ctx,
      9,
      "Upgrade to an uncommitted implementation",
      "Only implementation A may be installed on the proxy.",
      "upgradeTo() pointing at implementation B.",
      upgradeRule,
      [
        {
          target: proxyAddr,
          value: 0n,
          data: proxy.interface.encodeFunctionData("upgradeTo", [implB]),
        },
      ],
      [
        {
          target: proxyAddr,
          value: 0n,
          data: proxy.interface.encodeFunctionData("upgradeTo", [implB]),
        },
      ],
      { expectAccept: false },
    ),
  );

  const ownershipRule: Rule[] = [
    rule(
      Kind.OWNERSHIP,
      proxyAddr,
      ownershipSel,
      expectedOwner.address,
      0n,
    ),
  ];
  results.push(
    await runCase(
      ctx,
      10,
      "Ownership to an uncommitted owner",
      "Ownership may only move to the expected owner.",
      "transferOwnership() to an undisclosed wallet.",
      ownershipRule,
      [
        {
          target: proxyAddr,
          value: 0n,
          data: proxy.interface.encodeFunctionData("transferOwnership", [
            stranger.address,
          ]),
        },
      ],
      [
        {
          target: proxyAddr,
          value: 0n,
          data: proxy.interface.encodeFunctionData("transferOwnership", [
            stranger.address,
          ]),
        },
      ],
      { expectAccept: false },
    ),
  );

  results.push(
    await runCase(
      ctx,
      11,
      "Rule count does not match action count",
      "Three actions require three top-level rules.",
      "Three actions submitted with only two rules.",
      aipRules.slice(0, 2),
      aipActions,
      aipActions,
      { expectAccept: false },
    ),
  );

  const passed = results.filter(Boolean).length;
  console.log(`\n================ SUMMARY ================`);
  console.log(`${passed} of ${results.length} cases behaved as expected.`);
  if (passed !== results.length) {
    console.log("One or more cases did NOT behave as expected; see above.");
    process.exit(1);
  }
  console.log("Every verdict above came from the contract, not a model.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
