# Pact: 48-hour build plan

**Status:** the smallest working reference demo is implemented in this repository. This plan preserves the 48-hour scope and shows where to cut if rehearsing the build again.

## Definition of done

- Separate mock-USDC payroll and working-capital vaults.
- A board offers high-work/high-pay and low-work/low-pay packages.
- Registered employees vote one-person-one-vote using a proposal-time snapshot.
- Execution changes future accrual only; earned balances cannot shrink.
- Employees withdraw vested pay through pull payments.
- No board or treasury function can sweep payroll.
- Public views distinguish accrued backing from accrued-plus-forward-runway backing.
- Payouts never overdraw; any shortfall remains visible and owed.
- A scripted demo and a guided browser walkthrough both complete.

The implemented demo **reports** underfunding. Rejecting an underfunded package at execution is a follow-up reserve gate, not part of the current guarantee.

## Contract structure

| File | Scope |
| --- | --- |
| `PayrollVault.sol` | Employee registry, per-second streams, future-only rate updates, withdrawals, and backing reports. |
| `PayrollGovernor.sol` | Exactly two packages, snapshot membership, one-person-one-vote, quorum, ties, and execution. |
| `WorkingCapitalVault.sol` | Company spending and irreversible transfers into payroll. |
| `MockUSDC.sol` | Existing six-decimal test token; never use its open mint in production. |

The employee registry intentionally lives in `PayrollVault` for the hackathon cut, avoiding a cross-contract registry without weakening the wage boundary.

## Schedule

| Hours | Build | Exit check |
| --- | --- | --- |
| 0–4 | Confirm the two-package story, scaffold Hardhat, and write the invariants beside the API. | Empty contracts compile; demo script has named before/vote/after beats. |
| 4–12 | Implement payroll accrual, deposits, withdrawal, and future-only base-rate updates. | Exact timestamp tests pass at old/new rates; earned balances never decrease except withdrawal. |
| 12–18 | Add employee snapshots, two-package proposals, one-person-one-vote, quorum, ties, and execution. | Double votes and late members fail; both high and low outcomes pass. |
| 18–22 | Add working capital, one-way payroll funding, and backing reports. | Treasury sweep reverts; accrued-only coverage is not called fully backed. |
| 22–26 | Add underfunded payout behavior and negative tests. | No overdraw; shortfall remains owed and publicly reported. |
| 26–32 | Build the guided vote → execute → withdraw interface and reserve view. | Either package can be demonstrated; working capital never changes on withdrawal. |
| 32–36 | Add deployment and isolated live demo scripts. | Fresh local deployment and full scripted rehearsal pass. |
| 36–40 | Finish the research slide, three judge answers, and legal roadmap. | Every research claim has a source or an explicit design-inference label. |
| 40–44 | Run all tests, browser interactions, mobile layout, and two on-stage rehearsals. | No console errors; reset works; fallback recording is ready if needed. |
| 44–48 | Buffer for failures and speaker preparation. Do not add features here. | One reliable demo path, one backup path, concise answers. |

## Cut lines

1. Cut Sepolia first; the local chain proves the mechanism without faucet risk.
2. Cut wallet connection next; label the guided UI as simulated and keep the real on-chain script.
3. Cut visual polish before cutting negative tests or the treasury-sweep demonstration.
4. Never cut the future-only accrual test, one-person-one-vote check, or honest backing labels.

## Three-beat stage demo

1. **Choice:** show Focus and Sprint, the snapshot electorate, and one employee casting one vote.
2. **Promise:** close the vote and show the future rate changing while the execution-time earned balance is preserved. Query the backing report.
3. **Boundary:** withdraw vested pay, show working capital untouched, then attempt a board payroll sweep and show the revert.

Run `npm run demo:payroll` against a fresh local node for the contract-level version. The browser at `/` is the guided simulation, not an on-chain wallet demo.
