# AegisDAO IntentLock

DAO governance security for CODE_TANTRAFEST.

One-line pitch: "DAOs don't get hacked at the vote. They get hacked
at the reading."

OpenZeppelin and Compound governors already bind a vote to exact
calldata, since 2020. What they do not bind is the proposal
description, the evidence behind it, or the code identity at
execution time. IntentLock binds evidenceRoot and disclosureHash
into the same struct the vote signs, and the executor refuses
anything outside that commitment, including code that changed at
an approved address after approval.

Evidence for the gap: IEEE TSE 2025, 3,348 DAOs, 65,436 proposals,
over 90 percent of examined proposals had descriptions inconsistent
with their code. Detection exists. Enforcement does not.

## Repo layout

- `contracts/` : Solidity, Person A. IntentGovernor,
  IntentLockExecutor, ProposalRegistry, DisclosureRegistry,
  CommitmentHasher, ActionDecoder, plus test helpers.
- `test/` : Hardhat Red-Team Arena scenarios 0 to 10.
- `sentinel/` : simulation, bytecode scan, guardian halt.
- `intelligence/` : evidence, chain scoring, intent bridge,
  44 unit tests.
- `app/` : Next.js arena API and console pages on main
  (proposals, voting, arena, disclosure, scorecard).
- `packages/shared/` : shared hashing, fixtures, scorecard,
  error map.
- Person B's full Next.js console lives on the `person-b`
  branch and is not merged into main yet. See
  `aegisdao_work_division.md` for ownership and the frozen
  JSON schemas.

## Run it: contracts and tests (main)

Requires Node.js 20 or later.

```bash
npm install
npx hardhat compile
npx hardhat test
npm run test:intelligence
npm run test:parity
npm run arena
```

To deploy locally and run the arena API console:

```bash
npx hardhat node
npm run deploy
cd app && npm install && npm run build && npm run start
```

The arena API runs scenarios with POST, not GET:
`POST /api/arena/3` runs the jargon upgrade scenario.
`GET /api/scorecard` and `GET /api/reports/3` are read-only.

## Run it: Person B console (person-b branch)

```bash
git checkout person-b
npm install
npm test
npm run typecheck
npm run lint
npm run demo:check
npm run build
npm run start
```

## Verified state, 2026-10-25 evening (run by Muse, not asserted)

Main, from a clean clone:

- Hardhat compile: passes, 19 Solidity files.
- Hardhat tests: 44 passing.
- Intelligence tests: 44 passing.
- Commitment parity (Solidity vs TypeScript): 14 passing.
- Red-Team Arena: 20 passing, scorecard 11 PASS, 0 FAIL.
- Local deploy to Hardhat node (chain 31337): passes, all
  contracts deploy, manifest written to deployments/local.json.
- Main app build: passes, 8 routes, API scorecard 200,
  arena scenario 3 POST 200, reports 200.

Person-b, from a clean clone:

- Vitest: 57 passing, 9 files.
- Typecheck and lint: clean.
- Demo check: passes.
- Production build: passes, 22 pages.
- Production server: all 8 main routes return 200.

## What is real, what is simulated, what is pending

- Real: Solidity executor enforcement, Red-Team tests,
  Sentinel simulation and halt, evidence hashing, decoder,
  reference executor model, scorecard generation.
- Simulated or fixture-based: Person B wallet graph data,
  queued transaction hashes, pre-baked AI extraction. All
  labelled SIMULATED DATA in the console.
- Pending, and the known integration gap: Person B's error
  map (17 selectors, reference-model names such as
  SelectorNotAuthorized) does not match main's real Solidity
  error map (43 selectors, names such as SelectorNotAllowed
  and UnauthorizedImplementation). Do not silently swap one
  for the other: Person B tests and reports depend on the
  reference names. Resolving this is a joint Person A plus
  Person B merge task, listed as the next step in
  MUSE_NEXT.md.
- Pending: root README existed only from this commit onward,
  person-b merge, live demo link, TantraFest submission
  and demo date.

## Coordination

- `MUSE_NEXT.md` : what Muse will do next, updated every
  session. Every agent on this repo should keep an equivalent
  note, so agents can work together without overwriting
  each other.
- `aegisdao_work_division.md` : ownership, frozen schemas,
  sync points, and demo roles.
- `PERSON_A_DIRECTION.md` : build order, prior art, and
  the five parity traps.

## Demo climax

A benign-looking proposal with a hidden upgrade action.
The vote passes. The executor still refuses it. That refusal,
with the decoded proposal-said vs actually-does report, is
the demo.
