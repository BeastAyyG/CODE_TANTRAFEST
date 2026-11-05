# 48-hour build plan — smallest working demo

Status: this is a plan. No payroll contracts exist in this repo yet (searched
`contracts/`, `scripts/`, `test/` for payroll/wage/salary/stablecoin on 2026-11-05 — no
matches). The repo's existing stack is reused as-is; the payroll contracts are new files
under `contracts/payroll/`.

## Smallest working demo — definition of done

1. The deployer funds two separate vaults with a mock stablecoin: the payroll vault and
   working capital.
2. The board (owner) offers two work packages for the next epoch: high work/high pay and
   low work/low pay.
3. Registered employees vote one-person-one-vote. One address, one vote; double voting
   reverts.
4. The epoch commit applies the winning package to accrual **from the flip forward**.
   Wages accrued before the flip are provably unchanged — asserted in a test and shown
   live.
5. An employee withdraws accrued wages: pull payment, no push.
6. A transaction moving payroll funds to working capital (or anywhere but an employee)
   reverts on-chain. That revert is a demo beat, not an accident.
7. The vote cannot promise unbacked pay: committing a package whose projected payroll
   exceeds the payroll vault balance reverts.

## Non-goals (cut in this order)

Continuous bidding (two fixed packages only) → on-chain identity beyond an owner-managed
employee registry → mobile styling → Sepolia deployment (the local Hardhat network is
enough) → multi-epoch history UI.

## Contract structure (to build)

`contracts/payroll/`:

| Contract | Responsibility | Key surface |
|---|---|---|
| `MockStablecoin.sol` | ERC20 demo money (OZ `ERC20`) | `mint` for demo accounts |
| `EmployeeRegistry.sol` | 1p1v weight source | owner adds/removes employees; `isEmployee`; `weightOf` is always 1 |
| `PayrollVault.sol` | Ring-fenced wage vault | `fund()` (one-way in); `accruedWage(address)` view; `withdraw()` — the only outbound call; per-second accrual at the current rate since the employee's `accruedThrough` timestamp |
| `WorkVote.sol` | Board packages + 1p1v vote | `proposePackages(highRate, lowRate)` (owner); `vote(package)`; `commitEpoch()` flips the accrual rate for the next epoch only; reverts if unbacked (I5) |
| `WorkingCapital.sol` | Company operating money | admin spending for the demo; deliberately has no function touching `PayrollVault` |

Accrual model: each employee's owed balance advances at the current rate × elapsed seconds
from their `accruedThrough` timestamp. A rate change at the epoch flip writes the new rate
and resets the timestamp; balances accrued at the old rate are already banked in
`accruedWage` and are unreachable by any vote. That single mechanism delivers I1.

## Invariants (each gets a named test)

- **I1 — earned wages immutable.** After any vote and epoch commit, every employee's
  pre-flip accrued balance is bit-identical.
- **I2 — ring fence.** `PayrollVault` has exactly one outbound call path: employee
  `withdraw()`. Owner sweep, arbitrary transfer, and cross-vault pull all revert.
- **I3 — one person, one vote.** Non-employees revert; a second vote from the same
  address reverts; votes are never weighted by any balance.
- **I4 — future-only.** A vote cast mid-epoch changes nothing until `commitEpoch`; the
  committed package binds only to the next epoch.
- **I5 — solvency guard.** `commitEpoch` reverts when projected payroll for the next
  epoch exceeds the payroll vault balance — votes cannot promise unbacked pay.
- **I6 — pull payments only.** No function in the system moves wages without the
  employee's call.

## 48-hour schedule

| Hours | Outcome | Cut line if behind |
|---|---|---|
| 0–4 | Scaffold `contracts/payroll/`; `npm run compile` green alongside existing contracts | none — non-negotiable |
| 4–12 | `PayrollVault` accrual math + I1/I2/I6 tests green | drop event polish, keep the math |
| 12–18 | `EmployeeRegistry` + `WorkVote` + I3/I4/I5 tests green | drop quorum niceties |
| 18–22 | `WorkingCapital` + `MockStablecoin` + negative tests | fold `WorkingCapital` into the deploy script if desperate |
| 22–30 | Demo page in the existing Next.js app (ethers v6): board panel, voter panel, vault panel with a live backing ratio | static screenshots as fallback |
| 30–36 | `deploy` + `seed` scripts for the demo state on the local Hardhat network (31337); rehearse the three-beat script | skip Sepolia |
| 36–42 | Full rehearsal ×3; record a clean fallback video; build the slide from `docs/payroll/PITCH.md` | — |
| 42–48 | Buffer + triage | ship the contract-level script demo without UI if needed |

## Demo script (three beats, ~3 minutes)

1. **Offer & vote.** The board proposes the two packages; two employees vote differently;
   the tally is visibly one-person-one-vote (a whale wallet gets the same weight).
2. **Flip.** `commitEpoch` fires; the UI shows the next-epoch stream change while the
   earned-balance column stays frozen; a highlighted test assertion proves I1.
3. **Attack.** From the working-capital admin, attempt to sweep payroll — the transaction
   reverts on-chain; show the revert reason on screen.

## Stack and commands (verified in this repo)

- Solidity 0.8.24 (Cancun), Hardhat toolbox, OpenZeppelin contracts ^5.6.1, ethers
  ^6.13.0, Node 20.12+ (see `hardhat.config.ts`).
- `npm run compile` · `npm run test` · local network 31337; follow the existing
  `deploy`/`seed` script patterns in `scripts/`; Sepolia guidance in `docs/SEPOLIA.md`
  (optional for this demo).
- Keep payroll tests in `test/payroll/` so the existing suite stays untouched.

## Honest limits (say these before a judge does)

Not production ready. No audit. Demo keys are demo keys. Testnet and mock token only.
The employment/legal layer is a roadmap (`docs/payroll/LEGAL.md`), not a claim.
