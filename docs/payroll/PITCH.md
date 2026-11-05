# Pitch — employee-governed payroll

**Framing rule for everything below: sell the problem, not the tech.** In today's company,
employees get no say in the work-versus-pay tradeoff, and payroll risk sits on them: pay
depends on decisions they cannot see, made from books they cannot audit, backed by nothing
they can check. The DAO is just the mechanism that fixes it.

## The one slide

**Pay you can verify. Votes that can't touch it.**

| Research says | So we built |
|---|---|
| Token-weighted DAO voting hands power to whales — concentrated control is a documented governance vulnerability (Han/Lee/Li 2025; Buterin 2021) | **One employee, one vote.** Governance weight is a person, not a wallet |
| Token voting entrenches control and invites vote buying and empty voting (Strnad 2024; Buterin 2021) | **Votes change only future pay.** Wages already earned sit on-chain, outside every vote's reach |
| DAO pay design is an unsolved governance problem; time-based schedules misalign (Davidson 2023) | **Pay in a stablecoin from a ring-fenced payroll vault.** Same unit on day one as on day thirty — so backing is publicly checkable |
| DAO governance research centres token holders; contributor engagement is measurable and design-linked (Han/Lee/Li 2025 scope; talentDAO organisational-health work) | **The work-vs-pay tradeoff is the governed object.** The board offers two packages; employees vote |

Bottom bar: **"Research says governance failures are about money and control. So the
payroll vault — not the token — is what we govern."**

Citations: full records in `docs/payroll/RESEARCH.md`. Rows 1–3 are paper-backed; row 4's
payroll application is our design inference on top of a real research gap.

## Speaker narrative (~90 seconds)

**0:00 — the problem (20s).** "Every employee already lives in a tradeoff between how hard
they work and what they're paid — and they get zero say in it. Payroll is a private
spreadsheet. If the money isn't there, the risk lands on the person waiting for payday."

**0:20 — why it persists (20s).** "Nothing is wrong with the idea of payroll; what's
missing is verification. You can't audit your employer's payroll, and you can't vote on it
either. DAO research keeps documenting what happens when money and control share one
weighting: whales."

**0:40 — the mechanism, one breath (30s).** "So we made the payroll vault the thing you
govern. Pay accrues in a ring-fenced stablecoin vault anyone can verify on-chain. The
board offers two work packages — high work, high pay, or the opposite — and employees vote
one-person-one-vote. And here is the rule that makes it safe: a vote can only change
future pay. What you have already earned is locked, out of every vote's reach."

**1:10 — live + close (20s).** "Watch: we vote, the epoch flips, next month's pay stream
changes — and the earned balance doesn't move by a cent. Then watch the company try to
raid payroll. The chain says no."

## What the demo must show (ties to `docs/payroll/BUILD_PLAN.md`)

1. Two packages on screen; the vote tally counts people, not tokens.
2. Epoch flip: the next-epoch pay stream changes while the earned balance stays frozen.
3. An employee withdraws accrued wages (pull, not push).
4. A treasury→payroll sweep attempt reverts on-chain, live.

## Labels we keep on stage

- Research rows are paper-backed (`docs/payroll/RESEARCH.md`); the payroll application is
  our design.
- The talentDAO citation is directional — no verified pay-governance study exists; we lean
  on their verified organisational-health work and say so if pressed.
- Legal appears as a roadmap slide only (`docs/payroll/LEGAL.md`): entity wrapper options
  with counsel as the next step. Not legal advice.
- Prototype on testnet with a mock stablecoin. Not production ready, not audited.
