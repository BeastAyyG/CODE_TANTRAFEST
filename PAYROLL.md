# Pact payroll prototype

## The problem

Employees rarely control the tradeoff between workload and pay, yet they carry the risk that payroll is late, underfunded, or paid in a volatile asset. Pact uses a DAO only to make two promises enforceable:

1. Employees decide future work/pay terms with equal voting power.
2. Earned wages sit outside company and voter discretion.

## Implemented mechanism

| Contract | Responsibility |
| --- | --- |
| `contracts/payroll/PayrollGovernor.sol` | Board-drafted high/low packages, creation-time employee snapshots, one-person-one-vote, quorum, ties, cancellation, and execution. |
| `contracts/payroll/PayrollVault.sol` | Employee registry, per-second accrual, future-only base/package rate updates, pull withdrawals, and public backing reports. |
| `contracts/payroll/WorkingCapitalVault.sol` | Separate operating funds, board spending, and explicit one-way transfers into payroll. |
| `contracts/test-helpers/MockUSDC.sol` | Six-decimal test stablecoin. Its open mint is demo-only. |

Every rate change settles elapsed time at the old rate before updating the future rate. Removed employees keep their vested balance. Withdrawals always pay `msg.sender`; there is no board withdrawal, arbitrary token-call, or treasury sweep path.

## Backing terminology

`backingReport(horizonSeconds)` separates:

- **liquidBalance:** mock USDC currently held by payroll;
- **vestedUnwithdrawn:** earned employee pay not yet withdrawn;
- **futureRunway:** projected commitments over the requested horizon;
- **accruedBacked:** whether liquid assets cover earned pay;
- **runwayBacked:** whether assets cover the forward commitment alone;
- **fullyBacked:** whether assets cover earned pay plus forward commitments;
- **shortfalls:** separate accrued and runway deficits.

Covering only accrued wages is not reported as full backing. Payouts are capped at liquid assets, and unpaid vested amounts remain owed. This makes underfunding visible; it does not guarantee solvency. The current governor does **not** reject an underfunded winning package. A reserve gate and a longer runway policy are production-hardening work, not completed claims.

## Verification

```bash
npx hardhat test test/payroll.test.ts  # 27 payroll tests
npm test                              # complete repository suite
```

The payroll suite covers high/low votes, snapshots, double and non-member voting, quorum and ties, exact accrual across rate changes, withdrawal, employee removal, treasury isolation, backing views, and underfunded payouts.

For the live rehearsal, start `npx hardhat node` in one terminal, then run:

```bash
npm run deploy:payroll
npm run demo:payroll
```

Deployment writes `deployments/payroll-localhost.json`. The demo deploys an isolated fixture and uses local EVM time jumps; it is not a Sepolia deployment.

## Browser demo and pitch

`npm run build:payroll && npm run start:payroll` builds and starts the Next.js app. The guided interface is a browser simulation with clear labels, not a wallet connection or an on-chain attestation. It demonstrates selecting either package, reaching quorum, applying future terms, watching the accrued counter, withdrawing, and checking the reserve view.

The one-slide research mapping is available at `/pitch` and in `docs/payroll/PITCH.md`. Research-backed findings are distinguished from Pact's design inferences in `docs/payroll/RESEARCH.md`.

## Known limits

- Fixed board EOA and unbounded employee-list loops; suitable for a small demo only.
- First-come-first-served payouts if payroll is underfunded.
- Mock stablecoin and local accounts carry no real-asset guarantee.
- No external security audit, formal verification, legal wrapper, employment/tax integration, or production custody design.
