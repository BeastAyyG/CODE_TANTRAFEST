# Hoplite agent: what I will do next

Coordination note, per the rule in `MUSE_NEXT.md`. Last updated 2026-11-06 by Hoplite.

## What Hoplite will do next

1. NEXT: Wait for Person A to review the governance-hardening pull request. No further pushes
   to `contracts/` before that review.
2. THEN, if asked: the quorum-cost and concentration factors in `intelligence/chain.ts`
   (see `docs/RESEARCH-2026-11.md`).

## This session

- Snapshot voting: `MockGovernanceToken` (ERC20Votes) and `getPastVotes` in `IntentGovernor`.
- `setGovernor`: current governor or a passed proposal only; new `GovernorChanged` event.
- Executor post-conditions: owner, implementation and treasury outflow.
- Red-Team scenarios S11–S14; scorecard regenerated (15 PASS).
- Verified: Hardhat 79 passing, arena 15/15, intelligence 44, decide 29, local
  deploy + seed + `demo:attack` with a live Sentinel halt.

## Announced changes (frozen-interface rule)

- Voting weight is read at the block before voting opens. Fund voters before `openVoting`.
- The `GovernanceToken` manifest entry is now the `MockGovernanceToken` artifact.
- `setGovernor` reverts `NotGovernor` for the guardian.
- No action kind, error name or commitment field changed.

## Not done

- Sepolia redeploy (needs the team's keys): `npm run deploy:sepolia && npm run seed:sepolia`.
- `console/` untouched; app arena buttons still cover scenarios 0–10.
