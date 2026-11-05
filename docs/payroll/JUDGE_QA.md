# Judge QA — top 3 attack questions

Discipline for every answer: point at something on-chain or at
`docs/payroll/RESEARCH.md`. Never claim production readiness, audits, or legal
compliance — we have none.

## Q1 — "One-person-one-vote? That's just a normal company with extra steps. Where's the DAO?"

**The attack underneath:** we added a blockchain to an org chart and called it a DAO.

**30-second answer.** The new part is not the voting rule; it is what gets governed and
how the result is enforced. In a normal company payroll is a private spreadsheet and the
promise is unsecured. Here wages accrue in a ring-fenced vault anyone can verify on-chain,
and the vote's only effect is on future pay — earned wages are untouchable. We
deliberately chose one-person-one-vote because DAO-governance research keeps documenting
that token-weighted voting concentrates power in whales: capital over labour, the exact
problem we are fixing (Han/Lee/Li 2025; Buterin 2021). The DAO part is on-chain
enforcement plus public verifiability, not exotic voting math.

**Point at:** the live backing ratio, and the reverted payroll sweep.

## Q2 — "What actually stops you — or anyone — from raiding payroll?"

**The attack underneath:** the vault is just keys; keys get lost, stolen or coerced.

**30-second answer.** The payroll vault has exactly one outbound function: an employee
withdrawing wages they already accrued. There is no admin sweep, no bridge out, and the
vote object is the *future* accrual rate — never the earned balance. Funding is one-way,
and the working-capital contract has no function that can pull payroll back. You do not have
to trust us: watch the sweep attempt revert on-chain, then read the one outbound path in
the source.

**Point at:** the revert in beat 3 of the demo; invariants I1/I2 in
`PAYROLL.md`.

## Q3 — "Is employees voting on pay even legal?"

**The attack underneath:** wage terms are employment-law territory; this gets everyone sued.

**30-second answer.** Legal is a roadmap slide, not a claim. The prototype runs on a local test chain
with a mock token, so nothing here touches a real employment relationship. The design
keeps the on-chain record separate from the employment contract, and our explicit next
step is counsel to pick the entity wrapper — the options and open questions are already
written down (`docs/payroll/LEGAL.md`). "Engage counsel" is on the slide on purpose.

**Point at:** the legal roadmap slide and the counsel question list.

## Rapid fire (one-liners)

- **Why a stablecoin?** Pay in a native token makes wages swing with price; a stablecoin
  keeps the unit fixed so backing is actually checkable. Our design choice (D1 in
  RESEARCH.md), not a paper claim.
- **What if the vote picks pay the company can't fund?** The current prototype exposes
  accrued and forward-runway shortfalls and never overdraws; it does not reject an
  underfunded winner. An execution-time reserve gate is the next hardening step.
- **Why not just a multisig?** A multisig moves money; it does not make the payroll
  promise publicly verifiable, and it cannot stop a majority from touching earned wages.
- **Low turnout — the participation problem Strnad documents (S3)?** If no quorum is
  reached, the current package carries over: nobody's pay silently changes.

## Answer discipline

- Cite only what `docs/payroll/RESEARCH.md` labels PAPER-BACKED.
- Label our own choices as design choices — that honesty plays well with judges.
- "Not audited, not production, local-test-chain only" is an answer, not an apology.
