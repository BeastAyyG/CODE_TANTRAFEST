# Project status — read this first

One page to orient anyone joining this repo: what it is, what is verified, what is simulated,
what is blocked, and where the detail lives.

Last verified: **2026-10-25**. Everything below was executed, not asserted.

---

## 1. What this is

**AegisDAO IntentLock** — a decision-integrity console for DAO treasury proposals.

A proposal passes a vote; the queued transaction does something else. The demo proposal
**AIP-042** authorises 250,000 USDC across two transfers and a bounded allowance. The queued
transaction is an `upgradeTo(maliciousImpl)` on the treasury proxy. The reference executor
rejects it with `SelectorNotAuthorized`.

The thesis: **voting transparency is not informed consent.** A voter can read the forum post, the
delegate tally and the timelock, and still have no idea which bytes will execute. This repo makes
the gap between "what the proposal said" and "what the transaction does" the primary artifact.

**Stack:** Next.js 16 App Router, React 19, Tailwind v4, viem 2, zod 4, Vitest 5.
Runs fully offline — no chain, no network, no live model.

---

## 2. Verified state

| Check | Command | Result |
| :--- | :--- | :--- |
| Tests | `npm test` | **52 passing** in 8 files |
| Scorecard | `npm run scorecard` | **25 PASS · 0 FAIL · 9 TEST_REQUIRED** (34 entries) |
| Types | `npm run typecheck` | clean |
| Lint | `npm run lint` | clean |
| Build | `npm run build` | **passes** — 21 pages, all 11 `/arena/*` prerendered |
| Demo consistency | `npm run demo:check` | 11/11 scenarios match expected |
| Arena CLI | `npm run arena -- 3` | prints `REJECTED SelectorNotAuthorized` step by step |
| Routes | `npm run dev` | 7 routes, all 200 |

Headline numbers, computed live (nothing is hardcoded in the UI):

| Stage | Score | Status | Meaning |
| :--- | ---: | :--- | :--- |
| Claims | 0.81 | GREEN | 6 retained claims, 2 ambiguities resolved, `c6` rejected |
| COI | 0.88 | RED | 4 links; noisy-OR above the 0.65 threshold |
| Voting | 0.71 | AMBER | 59% informed weight; one 90,000-weight FOR voter overlaps a flagged wallet |
| Execution | — | RED | `SelectorNotAuthorized` — hard gate, no score |

Arena: **1 PASSED · 8 REJECTED · 2 FLAGGED** across 11 scenarios.

---

## 3. The honesty ledger

The single most important table. Do not upgrade a row without changing the code that earns it.

| Area | Status | What that means |
| :--- | :--- | :--- |
| Evidence hashing + Merkle proofs | **Real** | `keccak256(UTF-8)` leaves, sorted-pair tree, proofs verify in the browser. Documents are authored seeds. |
| Extraction validator | **Real** | Zod + source-quote hydration; a claim without a matching span is rejected. |
| Intent / content / commitment hashing | **Real code** | Byte parity with Solidity is **not** proven (P1). |
| Calldata decoder + error mapping | **Real** | ERC-20, proxy, Ownable, recursive multicall. Unknown selectors are flagged, never hidden. |
| Reference executor | **Real model, not EVM** | Rule, commitment, version, timelock, value, re-entrancy and post-condition checks. Executes nothing. |
| Violation report | **Real, deterministic** | Assembled from the run result, never from prose. |
| Wallet graph math | **Real** | Direct-transfer, common-funder, time-correlation; disclosure damping; noisy-OR. |
| Voting / claims / COI scoring | **Real code over fixtures** | Formulas run; inputs are fixtures. |
| AI extraction | **Pre-baked** | `intent.extracted.json` / `claims.json` are fixtures. No model is called. |
| Wallet graph data | **Simulated** | Addresses, amounts, timestamps, tx hashes labelled `SIMULATED DATA`. |
| Queued tx + tx hashes | **Simulated** | Derived deterministically from scenario id, calldata, block. Nothing broadcast. |
| Disclosure challenge | **Simulated status, real payload** | Flag requires the graph to reach the red threshold; the payload and digest are computed. |
| Sentinel trace | **Fixture** | Verdict is derived by walking the trace for `DELEGATECALL`. Not a fork trace. |
| Solidity executor, governor, registries | **Pending Person A** | Nine properties `TEST_REQUIRED`, amber, never green. |

---

## 4. What is done vs what is blocked

### Done — Person B (this workspace)

- Hashing, Merkle evidence, validator, decoder, reference executor, report, graph, scoring.
- Seven routes, arena runner, scorecard, fixtures and regeneration scripts.
- Verdicts for the sentinel and disclosure layers are **derived from evidence**, not from the
  scenario's layer label. Both scorecard rows fail if that derivation is removed.
- Docs: this file, `README.md`, `docs/demo-script.md`, `docs/person-a-handoff.md`,
  `docs/audit-2026-10-25.md`.

### Blocked — Person A (no Solidity in this repo)

Nine deliverables, all specified in `docs/person-a-handoff.md` §1:

1. Contracts: `ProposalRegistry`, `DisclosureRegistry`, `IntentGovernor`, `IntentLockExecutor`,
   `ActionDecoder` + mocks.
2. ABIs and `deployments/local.json` — replaces derived addresses.
3. Error selector parity with `ERROR_DEFINITIONS`.
4. Solidity hash vectors for six keys → closes **P1**.
5. Real evidence fixtures per scenario.
6. Hardhat scorecard → closes **P2–P9**.
7. Real `callTracer` traces for scenarios 3, 4, 6 → closes **P8**.
8. `npm run arena` bridge to a live deployment.
9. Deployed executor adapter behind the existing `RunResult` shape.

**The nine amber properties:** Solidity hash parity · append-only registry · commitment
immutability · real EVM re-entrancy · EIP-1967 post-condition · timelock + executed flag ·
guardian halt · real Sentinel trace · on-chain disclosure verification.

---

## 5. Run it

```bash
npm install
npm run dev            # http://localhost:3000
npm test               # 52 tests
npm run demo:check     # read-only consistency check, writes nothing
npm run build          # production build
```

Fixture regeneration (`scorecard`, `evidence:build`, `vectors`, `errors`) **overwrites fixtures**.
Run them intentionally, then re-run `npm test`.

---

## 6. Environment gotchas (each cost real time)

- **`vitest` needs a writable TEMP.** In this sandbox it dies with `EPERM` on `%TEMP%` unless you
  redirect: `TMPDIR=./.tmp TEMP=./.tmp TMP=./.tmp npx vitest run`.
- **`next build` hangs forever on a stale `.next/lock`.** Symptom: silence, then "Another next
  build process is already running." Kill the orphaned `next build` PID, `rm -f .next/lock`,
  rebuild — it then compiles in ~2s. `next dev` uses `.next/dev` and does not conflict.
- **`curl` localhost needs `--noproxy '*'`** — the sandbox exports a loopback HTTP proxy.
- **`gh` needs `APPDATA` and `USERPROFILE` exported** or it reports being logged out.
- **graft** is installed for repo navigation: `graft map .`, `graft ask "…" .`,
  `graft callers <symbol> .`. Always pass `--json`; there is no quiet flag.

---

## 7. Where to read next

| Doc | Read it for |
| :--- | :--- |
| `README.md` | Full architecture, hash scheme, formulas, fixture map, limitations. |
| `docs/demo-script.md` | The rehearsable 5-minute click path with exact expected values. |
| `docs/person-a-handoff.md` | Exact swap points, schemas, interface rules, acceptance checklist. |
| `docs/audit-2026-10-25.md` | Independent audit: what was claimed vs what was proven, and what was fixed. |

---

## 8. The one-line summary

The decision trail, the evidence binding, the conflict detection and the enforcement logic are
real code over labelled fixtures. The on-chain guarantee is a specification, not a fact — and the
scorecard says so in amber, on purpose.
