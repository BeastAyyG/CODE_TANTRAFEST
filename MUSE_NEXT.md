# Muse agent: what I will do next

This file is Muse's coordination note for AegisDAO IntentLock, in the
CODE_TANTRAFEST repo. It exists so Muse can work together with the
other team's AI agents without overwriting each other.

Rule for every agent on this repo, including Muse: update your own
next-steps note at the end of every work session, before you push.
The note must always state, first, what that agent will do next.

Last updated: 2026-10-25, about 21:15 IST, by Muse.
Run verification below replaces the earlier state. No new
commit from the other team was found on any branch at that
time: main head was still Muse's 3476099 commit, person-b
head was still ea78e84 from 17:07 IST.

## Who Muse is here

Muse is Agastya's personal agent and the integrator for this repo.
Muse is not Person A (contracts and security) and not Person B
(intelligence and console). Muse codes directly over SSH on
agbeast-1 with free CLI coding options, runs the test gates, merges
branches, and keeps the demo working end to end.

Muse does not use the claude CLI agent for coding unless Agastya
asks for it. Claude is for research and decisions.

## Run verification, 2026-10-25 about 21:00 IST (Muse, clean clones)

No failing tests were found. All of these were run, not asserted:
- Main: Hardhat compile passes, Hardhat tests 44 passing,
  intelligence tests 44 passing, parity 14 passing, arena
  20 passing with scorecard 11 PASS, local deploy to Hardhat
  node passes, main app build passes with API scorecard 200
  and arena scenario 3 POST 200.
- Person-b: Vitest 57 passing, typecheck clean, lint clean,
  demo check passes, production build passes, all 8 main
  routes return 200 on the production server.
- One real integration bug found, not fixed unilaterally:
  person-b error map (17 selectors, reference-model names
  such as SelectorNotAuthorized) does not match main's real
  Solidity error map (43 selectors, names such as
  SelectorNotAllowed). Person B tests and reports depend on
  the reference names, so swapping the map would break them.
  This needs a joint Person A plus Person B decision during
  the merge, not a silent overwrite by Muse.
- Note: main app arena route is POST only by design. A GET
  to /api/arena/3 returns 405. That is expected, not a bug.
- Note: running arena or scorecard regenerates scorecard
  files with only durationMs changes. Restore those files
  before committing, or the diff is timing noise only.

## What Muse will do next, in order

1. NEXT: Resolve the error-map mismatch with Person A and
   Person B, then integrate the person-b console with the
   main contracts.
   person-b is a separate Next.js history, not a fast-forward off
   main, so this is a careful merge, not a blind overwrite. Keep
   contracts/ from main and app/ from person-b, and resolve the
   overlapping folders (packages, sentinel, scripts) file by file.
   Do not push this merge until the test gate in step 4 passes.
2. THEN: Wire the console to real Hardhat outputs, following the
   work division sync points: ABIs and deployments/local.json,
   errors.json, hash vectors for Solidity/TypeScript parity,
   real violation fixtures, and the real Hardhat scorecard.
   Replace mock data only where a real output exists. Anything
   still mock stays labelled as mock.
3. THEN: Re-run the full test gate after the merge and fix
   what fails: Hardhat contract tests, the 44 intelligence
   tests on main, the 57 Vitest tests on person-b, typecheck,
   Next.js build, and the live refusal demo (scenario 3,
   hidden upgradeTo, vote passes, executor refuses).
4. THEN: Update this file with the new verified state and the
   next step, and tell Agastya what is still blocked.

## What Muse will NOT do

- Push straight over another agent's branch work, or edit a folder
  owned by Person A or Person B without a PR or a message.
- Change a frozen schema, an action kind, an error name, or a
  commitment field without announcing it first, because that
  breaks the other side.
- Claim a live on-chain result from fixture or reference-model
  output. Simulated data stays labelled SIMULATED DATA.
- Mark main as demo-ready unless the test gate in step 4 passes.

## Current verified state (2026-10-25 evening)

- Main: contracts (IntentGovernor, IntentLockExecutor,
  ProposalRegistry, DisclosureRegistry, CommitmentHasher,
  ActionDecoder), Red-Team Arena, Sentinel simulation,
  intelligence modules with 44 unit tests, console UI with
  mock data. No README.
- Person-b: Next.js console, 57 Vitest tests, 25 PASS / 0 FAIL /
  9 TEST_REQUIRED on its reference scorecard, judge mode,
  presentation deck, downloadable reports. Solidity parity
  is not proven (P1).
- Branches: main, person-b, contracts-core, b/judge-mode.
  Person-b is unmerged.
- Open questions for Agastya: TantraFest submission and demo
  date, and whether person-b merges before it.

## How the other agents should coordinate with Muse

- Keep your own next-steps note updated the same way, and read
  this file before starting a session.
- Work only in your owned folders. Changes in another owner's
  area go through a short message or a PR.
- If you are blocked, use the mitigation in
  aegisdao_work_division.md section 4 and keep moving, and
  record the block in your note.
- Main stays demo-able at all times. If a change breaks the
  demo, say so in your note and fix it or revert it.

## Coordination log

- 2026-10-25 evening: Muse created this file on main at
  Agastya's request, so Muse's next steps are visible to the
  other team in the repo itself.
- 2026-10-25 about 21:15 IST: Muse checked GitHub for new
  updates (none found), ran both branches clean, found the
  error-map mismatch, added root README.md, and updated
  this file. No code was changed and no merge was pushed.
