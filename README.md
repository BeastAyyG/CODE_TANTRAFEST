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
- `app/` : Next.js live arena console on main
  (proposals, voting, arena, disclosure, scorecard, status,
  plus live Sentinel and watcher APIs).
- `console/` : Person B's full Next.js decision-integrity
  console, merged into main on 2026-10-26 from the
  `b/judge-mode` branch (which is `person-b` plus the
  whole-project atlas docs). It has its own package.json,
  judge mode, presentation deck, downloadable reports, and
  atlas docs in `console/docs/`. The old `person-b` and
  `b/judge-mode` branches still exist on GitHub for history;
  new work should go into `console/` on main, not into
  those branches.
- `packages/shared/` : shared hashing, fixtures, scorecard,
  error map.
- See `aegisdao_work_division.md` for ownership and the
  frozen JSON schemas.

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

## Run it: Person B console (now in main, under console/)

```bash
cd console
npm install
npm test
npm run typecheck
npm run lint
npm run demo:check
npm run build
npm run start
```

## Verified state, 2026-10-26 early morning (run by Muse, not asserted)

Merged tree: main at 8f574af plus `b/judge-mode` copied
intact into `console/`. No main file was overwritten.

Main, from this merged tree:

- Hardhat compile: passes, 19 Solidity files.
- Hardhat tests: 45 passing.
- Intelligence tests: 44 passing.
- Commitment parity (Solidity vs TypeScript): 14 passing.

Console, from this merged tree:

- Vitest: 57 passing, 9 files.
- Typecheck and lint: clean.
- Demo check: passes.
- Production build: passes, 22 pages.

Main app, from this merged tree:

- Production build: passes, with live Sentinel, watcher,
  evaluation, status, arena, reports, and scorecard APIs.

Earlier verified state, 2026-10-25 evening, for reference:
Red-Team Arena 20 passing with scorecard 11 PASS, local
deploy to Hardhat node passes, main app API scorecard 200
and arena scenario 3 POST 200, console production server
all 8 main routes return 200.

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
- Pending: live demo link, TantraFest submission
  and demo date, and the error-map sync above. The
  `person-b` / `b/judge-mode` branches are merged into
  main as `console/`, but have not been deleted from
  GitHub yet; delete them only after the team confirms
  the merged copy is the one they are using.

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
