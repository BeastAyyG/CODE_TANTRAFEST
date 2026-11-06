# Security model

What the system guarantees, what it assumes, what it refuses, and what it does not catch.
Every claim below is backed by a test or by code you can read.

## Guarantees

1. **The vote binds to the exact execution package.** Target, value, calldata, typed rules,
   disclosure, proposal version, chain id and executor address all enter the commitment. The
   executor recomputes it from the submitted bytes and reverts on any difference
   (`CommitmentMismatch`, `IntentHashMismatch`).
2. **Only committed shapes execute.** A call is allowed only if it matches a typed rule from
   the committed intent. Unknown selectors, unapproved recipients, over-ceiling amounts,
   unapproved implementations, unapproved ownership transfers and hidden multicall children
   revert before the call is made.
3. **Code identity is checked at execution time.** An `UPGRADE` rule may pin the
   implementation's `extcodehash`; a contract whose code changed after the vote does not match
   (`CodeHashMismatch`).
4. **State cannot be replayed or raced.** `block.timestamp < eta` reverts, the executed flag
   is set before external calls, `nonReentrant` guards `execute`, the chain id is in the
   commitment, and a superseded version cannot execute.
5. **Voting cannot open without a disclosure**, and a verified disclosure challenge blocks
   voting (`NoDisclosure`, `DisclosureChallenged`).
6. **The guardian can only halt.** `halt`/`haltBySig` change only `Queued → Halted`. A guardian
   signature cannot execute, edit or substitute a commitment, and the guardian cannot rotate the
   governor: `setGovernor` accepts only the current governor or the executor itself, so after
   deployment a rotation is a passed, timelocked proposal (`NotGovernor`).
7. **Votes are weighed at a snapshot.** The governor reads `getPastVotes` at the block before
   voting opened, so tokens borrowed, bought or moved afterwards carry no weight on that
   proposal (`InsufficientVotingPower`).
8. **Execution is re-checked afterwards.** After the actions run, each called contract's
   `owner()` and `implementation()` must be unchanged or equal what an ownership or upgrade rule
   committed, and the executor's outflow of each token named by a transfer or approve rule must
   stay within those rules' `maxAmount`s (`PostConditionFailed`).

## Assumptions

- The governance token, registry, governor and executor are deployed and configured correctly
  (constructor arguments are recorded in the deployment manifest).
- The guardian key is not compromised. A compromised guardian can halt honest proposals (a
  liveness failure) but cannot execute or rotate the governor. Use a multisig for the role.
- The demo governance token (`MockGovernanceToken`, like `MockUSDC`) has an open `mint` for
  testnet demos. Snapshot voting stops tokens minted during a vote from counting, but a
  production deployment needs a token whose supply governance controls.
- Voters read the brief they acknowledge. The contract records *that* a brief hash was signed;
  it cannot prove comprehension.
- Evidence documents were hashed before signing. The Merkle root proves the documents did not
  change after signing; it does not prove they are true.

## Threat model

| Attack | Blocked by | Test |
| :--- | :--- | :--- |
| Recipient swapped after the vote | Commitment mismatch, rule counterparty | [`scenario1-recipient-swap.test.ts`](../test/redteam/scenario1-recipient-swap.test.ts) |
| Amount inflated | Commitment mismatch + `ExceedsSpendLimit` | [`scenario2-amount-inflation.test.ts`](../test/redteam/scenario2-amount-inflation.test.ts) |
| "Routine tuning" hides `upgradeTo(malicious)` | No matching rule; `SelectorNotAllowed` / `UnauthorizedImplementation`; code hash pinning | [`scenario3-jargon-upgrade.test.ts`](../test/redteam/scenario3-jargon-upgrade.test.ts) |
| Hidden `transferOwnership` inside `multicall` | Recursive child-rule enforcement, depth ≤ 2, child-count check | [`scenario4-nested-multicall.test.ts`](../test/redteam/scenario4-nested-multicall.test.ts) |
| Unlimited approval disguised as a payment | `UnlimitedApprovalNotCommitted` + bounded approve rule | [`scenario5-unlimited-approve.test.ts`](../test/redteam/scenario5-unlimited-approve.test.ts) |
| Payload routed via `delegatecall` | Executor has no delegatecall path; Sentinel flags it in the trace and bytecode scan | [`scenario6-delegatecall-payload.test.ts`](../test/redteam/scenario6-delegatecall-payload.test.ts) |
| Recipient re-enters `execute` | Executed flag set before the call + `nonReentrant` | [`scenario7-reentrancy.test.ts`](../test/redteam/scenario7-reentrancy.test.ts) |
| Early execution, double execution, cross-chain replay | Timelock, executed flag, `chainid` in the commitment | [`scenario8-timelock-replay.test.ts`](../test/redteam/scenario8-timelock-replay.test.ts) |
| Execute a stale version after a new revision | `VersionSuperseded` against the registry | [`scenario9-stale-version.test.ts`](../test/redteam/scenario9-stale-version.test.ts) |
| Hidden conflict of interest | Forced disclosure, challenge, `isChallenged` blocks voting | [`scenario10-hidden-coi.test.ts`](../test/redteam/scenario10-hidden-coi.test.ts) |
| Recycled or flash-loaned votes (Beanstalk, April 2022) | `getPastVotes` at the block before voting opened | [`scenario11-vote-recycling.test.ts`](../test/redteam/scenario11-vote-recycling.test.ts) |
| Guardian installs its own governor | `setGovernor` accepts only the governor or a passed proposal | [`scenario12-guardian-escalation.test.ts`](../test/redteam/scenario12-guardian-escalation.test.ts) |
| Called contract hijacks its owner or implementation | Owner and implementation re-checked after the call | [`scenario13-control-postconditions.test.ts`](../test/redteam/scenario13-control-postconditions.test.ts) |
| Committed call spends a stale treasury allowance | Outflow budget per named token | [`scenario14-treasury-outflow.test.ts`](../test/redteam/scenario14-treasury-outflow.test.ts) |
| Mutated preview calldata | `hashActions` compared with the committed `actionsHash` before simulating | [`preview.test.ts`](../test/preview.test.ts) (mutated-calldata case) |
| Replayed or forged relayed vote/halt | EIP-712 domain, deadline, per-signer nonce, guardian check | [`signature-flows.test.ts`](../test/redteam/signature-flows.test.ts) (HS1–HS7, HH1–HH4) |

## Red-Team Arena

Every scenario is a real Hardhat test and a button in the console. Latest run in this
workspace: **31 scenario tests passing, scorecard 15 PASS / 0 FAIL**.

| # | Scenario | Expected | Actual |
| :--- | :--- | :--- | :--- |
| 0 | Benign 5,000 USDC transfer | Succeeds | PASS |
| 1 | Post-vote recipient substitution | Reverts | PASS |
| 2 | Amount inflation | Reverts | PASS |
| 3 | Jargon upgrade (`upgradeTo`) | Reverts | PASS |
| 4 | Nested multicall hiding `transferOwnership` | Reverts | PASS |
| 5 | Unlimited `approve` | Reverts | PASS |
| 6 | Delegatecall payload | Not executable; Sentinel flags | PASS |
| 7 | Re-entrancy | Reverts | PASS |
| 8 | Early/double execution, cross-chain replay | Reverts | PASS |
| 9 | Stale version | Reverts | PASS |
| 10 | Hidden COI link | Flagged | PASS |
| 11 | Recycled and flash-loaned votes | No weight | PASS |
| 12 | Guardian rotates the governor | Reverts | PASS |
| 13 | Owner or implementation hijacked by the callee | Reverts | PASS |
| 14 | Stale allowance spent by a committed call | Reverts | PASS |

Scorecard snapshot (durations from the latest stored run):

| ID | Property | Status | Duration |
| :--- | :--- | :--- | ---: |
| S0 | Benign transfer succeeds | PASS | 451 ms |
| S1 | Post-vote payload substitution rejected | PASS | 156 ms |
| S2 | Amount inflation rejected | PASS | 169 ms |
| S3 | Unauthorized upgrade rejected | PASS | 179 ms |
| S4 | Hidden ownership transfer in multicall rejected | PASS | 219 ms |
| S5 | Unlimited approval rejected | PASS | 126 ms |
| S6 | Delegatecall payload not executable | PASS | 131 ms |
| S7 | Re-entrancy rejected | PASS | 61 ms |
| S8 | Early execution, double execution, and cross-chain replay rejected | PASS | 225 ms |
| S9 | Stale version rejected | PASS | 66 ms |
| S10 | Hidden conflict-of-interest link flagged | PASS | 59 ms |
| S11 | Recycled and flash-loaned votes carry no weight | PASS | 181 ms |
| S12 | Guardian cannot rotate the governor; only a passed proposal can | PASS | 116 ms |
| S13 | Owner and implementation re-checked after execution | PASS | 310 ms |
| S14 | Treasury outflow capped at the committed budget | PASS | 155 ms |

Regenerate it with the real suite:

```bash
npm run arena      # writes packages/shared/scorecard.json from the run
```

`scripts/scorecard-reporter.js` marks any property without a passing test as
`TEST_REQUIRED`; the console renders that amber, never green.

## Pre-vote effect preview

The preview is deterministic and read-only by construction:

- It verifies the calldata against the committed `actionsHash`, the rules against
  `intentHash`, and the recomputed commitment before simulating.
- It opens an `evm_snapshot`, impersonates the executor inside the snapshot, executes the
  actions, captures before/after state, and **always reverts** in a `finally` block — also
  when an action reverts or a read fails. `preview.test.ts` asserts balances, owner,
  implementation slot, nonce and `eth_blockNumber` are unchanged afterwards.
- A file lock (`sentinel/mutex.ts`) serialises snapshots with the Sentinel watcher and the
  arena runner, so two previews cannot interleave on one node.
- Anything it could not read — including functions a contract does not implement — is listed
  in `unobserved`. It is never reported as zero.
- It cannot run without `evm_snapshot`. On a plain JSON-RPC endpoint it returns `UNAVAILABLE`
  instead of risking state.

## What this does NOT catch

- **A vote that honestly authorizes something bad.** If the description matches the calldata
  and the vote passes, it executes. IntentLock binds intent to action; it does not judge intent.
- **Evidence that is self-authored but internally consistent.** Hashing proves the documents
  did not change, not that they are true.
- **A compromised governor or executor.** If the enforcement layer is replaced by an attacker,
  none of this holds. A guardian-key compromise can delay honest proposals with halts; it cannot
  rotate the governor.
- **Bought votes.** Snapshot voting stops borrowed and recycled votes. It does not stop an
  attacker who buys enough tokens before voting opens, as in the 2026 BonkDAO, Term Finance and
  Neutron takeovers. The timelock, the Sentinel halt and the typed rules are the response there.
- **Social capture of delegates.** The informed-vote receipt raises the cost of voting blind; it
  does not stop a delegate voting against their mandate with their eyes open.
- **Arbitrary-bytecode safety.** The executor enforces a restricted, typed action model. It does
  not prove that a contract you legitimately call is safe. `PARAM_SET` binds the selector and,
  when `maxAmount > 0`, the first `uint256` argument only.
- **Post-conditions without getters.** Owner and implementation are re-checked only where the
  target exposes `owner()` / `implementation()`; EIP-1967 storage cannot be read from another
  contract. The outflow budget covers tokens a top-level transfer or approve rule names; other
  tokens and multicall child transfers are left to the Sentinel's balance diff.
- **Multicall routing assumptions.** Child rules are matched against the decoded inner calls, and
  the inner call is executed by the multicall contract itself. This matches the demo helpers
  (self-delegatecall), and nesting deeper than 2 is rejected.
- **Simulation as a guarantee.** The Sentinel sees what a fork can observe. Its trace support
  depends on the node; without `debug_traceTransaction` it records that gap in `unobserved`.
- **Wallet-graph ground truth.** Addresses, amounts and timestamps are **SIMULATED DATA**, and
  link strengths are transparent heuristics. Output is "potential conflict, evidence attached".
- **AI truth.** Drafts are heuristic or **PRE-BAKED** fixtures. No LLM is in the enforcement
  path; a human confirms the intent.
- **Formal verification or audit.** There is none. The Sepolia deployment is a testnet demo, not
  a production governance system.
- **Storage invariants outside the watch list.** The preview watches a computed set of
  contracts and accounts; storage it does not read is not compared.
