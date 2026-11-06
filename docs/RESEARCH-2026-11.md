# What to add next: research notes (November 2026)

Why IntentLock matters now, what this change adds, and what to build next. Every figure links
to its source; vendor and news figures are marked as such.

## 2026 is the worst year for governance takeovers since Beanstalk

The Coinformer puts gross 2026 losses from successful governance takeovers at about
**$39.8 million**, combining Blockaid's count of at least seven takeovers between June 9 and
August 6 with the Term Finance and Neutron incidents. It notes some assets were later recovered
([The Coinformer, Oct 2026][coinformer]).

| Incident | What happened | Layer that answers it | Status |
| :--- | :--- | :--- | :--- |
| Beanstalk, Apr 2022, ~$182M ([CertiK][certik], [Immunefi][immunefi]) | Flash-loaned governance tokens passed a drain through `emergencyCommit`, with no execution delay | Snapshot voting + timelock | **Added here** (S11) |
| BonkDAO, Jul 2026, ~$21.2M ([QuillAudits][bonk]) | ~882.1B BONK bought and borrowed for about $4.4M, above the 879.95B quorum. BIP #76 was framed as "a reform effort to rebuild the DAO" and moved 4.43T BONK with a 0-second timelock | Typed rules, timelock, Sentinel halt; quorum-cost check | Covered at execution; quorum-cost check proposed |
| Term Finance, Aug 2026, ~$8.5M ([The Coinformer][coinformer]) | Attacker took control of a thinly held token, reportedly for under $1,000, and passed proposals granting vault access | Post-conditions (owner and implementation changes need a committed rule), guardian halt | Covered at execution; vote buying not prevented |
| Neutron, Sep 2026, ~$9.3M ([The Coinformer][coinformer]) | About $20,200 of NTRN passed a proposal granting admin control of Astroport and Drop contracts; their code was replaced and drained | Ownership and upgrade rules, `codeHash` pin, implementation post-condition | Covered at execution |
| Moonwell MIP-R39, Mar 2026 ([Blockful on the Moonwell forum][moonwell]) | "Protocol Recovery - Admin Migration" would hand admin of seven markets, the Comptroller and the Oracle to an unverified contract; 40.17M MFAM bought and self-delegated in one transaction | Sentinel bytecode scan, typed rules, guardian halt | Covered (halt); vote buying not prevented |
| Ampleforth FORTH, Sep 2026 ([Ampleforth forum][forth]) | Proposals to send 2.5M USDC to an unknown address and approve 3.5M USDC plus 3.5M FORTH | Transfer and approve rules, outflow budget, timelock | Covered |

The pattern: most 2026 attackers **bought** votes in thin markets rather than borrowing them,
then used proposals whose text did not describe what the calldata did. IntentLock's commitment
and executor answer the second half. The first half needs the quorum-cost check below.

## Added in this change

| Scenario | Property | Before this change |
| :--- | :--- | :--- |
| S11 | Votes are weighed at the block before voting opens (`getPastVotes`); recycled and flash-loaned votes carry no weight | One holder could vote, transfer, and vote again; a sub-quorum proposal passed in the test |
| S12 | Only the current governor or a passed, timelocked proposal can call `setGovernor` | The guardian could install any governor and queue anything |
| S13 | `owner()` and `implementation()` of every called contract are unchanged unless a rule commits the change | A callee could hand itself to an attacker during a "routine" call |
| S14 | Executor outflow of each named token stays within the committed `maxAmount`s | A "fee tuning" call could spend a stale treasury allowance |

Each new test was run against the previous contracts first and failed there (9 of 11 cases;
the two honest-path cases pass on both).

## Recommended next additions, in order

1. **Quorum-cost check** (intelligence, then optionally on-chain). Compare the market cost of
   quorum with the treasury a proposal can move, and flag or slow proposals where the treasury
   is worth more. BonkDAO's quorum cost about $4.4M against a $21.2M treasury
   ([QuillAudits][bonk]); Term Finance's decisive position reportedly cost under $1,000
   ([The Coinformer][coinformer]). A Circle Research preprint argues that attack costs on real
   DAOs sit orders of magnitude below the value at stake ([Bennett et al., arXiv:2605.18990][bennett]).
2. **Voting concentration in the VOTING stage.** Report HHI and top-three share next to quorum
   and informed ratio. In Han, Lee and Li's data the top three voters hold almost two-thirds
   of voting power on average, and a one-standard-deviation rise in HHI goes with 1.1 points
   lower weekly TVL growth against an average of −0.9% ([working paper][hll]; published in
   [Management Science][hll-ms]).
3. **Safe Guard, Zodiac Roles or OpenZeppelin Governor adapter**, so IntentLock protects an
   existing DAO instead of only its own governor (already first on the README roadmap).
4. **Executor-level treasury watch list**, so the outflow budget also covers tokens no rule names.
5. **Clear-signing descriptors** for `IntentVote` and `IntentHalt`, so a Ledger shows the
   commitment fields instead of a hash.
6. **CI on pull requests**: compile, `npx hardhat test` and `npm run arena`. The repository has
   no workflow today.

## Limits worth saying out loud

- Snapshot voting does not stop votes bought before voting opens; the proposer also chooses
  when voting opens.
- Post-conditions read `owner()` / `implementation()` only where a target exposes them.
- The demo governance token has an open `mint`, like `MockUSDC`. Production needs a token whose
  supply governance controls.
- The Sepolia deployment predates this change until it is redeployed.

[coinformer]: https://thecoinformer.com/news/dao-governance-theft-biggest-year-since-beanstalk
[certik]: https://www.certik.com/blog/revisiting-beanstalk-farms-exploit
[immunefi]: https://immunefi.com/blog/bug-fix-reviews/hack-analysis-beanstalk-governance-attack-april-2022/
[bonk]: https://www.quillaudits.com/blog/hack-analysis/bonk-dao-governance-takeover-exploit
[moonwell]: https://forum.moonwell.fi/t/governance-notice-unverified-proposal-on-moonriver-mip-r39/2143/2
[forth]: https://forum.ampleforth.org/t/recent-forth-activity-and-next-steps/901
[bennett]: https://arxiv.org/abs/2605.18990
[hll]: https://www.aidf.nus.edu.sg/wp-content/uploads/2023/02/DAO_Governance-Han-Lee-Li-WP23-022723.pdf
[hll-ms]: https://doi.org/10.1287/mnsc.2024.07033
