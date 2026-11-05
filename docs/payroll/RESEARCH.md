# Payroll DAO — research file

Source-backed facts for the payroll pitch track, kept separate from our own design
choices. Every claim in the payroll docs traces here and carries one of three labels:

- **[PAPER-BACKED]** — a listed source states or demonstrates it.
- **[DESIGN INFERENCE]** — our choice. We argue it; no cited source claims it.
- **[UNVERIFIED]** — asserted in the brief but not confirmed against a public source.

Verification date: 2026-11-05 (publisher records, abstracts and source pages checked
via web search; full texts noted where machine-readable).

## Verified bibliography

| # | Source | Record | Verified via |
|---|---|---|---|
| S1 | Han, J., Lee, J., & Li, T. (2025). "A Review of DAO Governance: Recent Literature and Emerging Trends." *Journal of Corporate Finance*, 91, 102734. | [SSRN 5074046](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=5074046) · [DOI](https://doi.org/10.2139/ssrn.5074046) · [ECGI WP](https://www.ecgi.global/publications/working-papers/a-review-of-dao-governance-recent-literature-and-emerging-trends) | ECGI record + abstract; SSRN record (manuscript dated Nov 3, 2024; first posted Feb 4, 2025) |
| S2 | Davidson, S. (2023). "Compensation in DAOs: A Proposal." *The Journal of The British Blockchain Association*, 6(2). DOI [10.31585/jbba-6-2-(4)2023](https://doi.org/10.31585/jbba-6-2-(4)2023) | [JBBA article](https://jbba.scholasticahq.com/article/87554-compensation-in-daos-a-proposal) | Publisher record; single author (RMIT Blockchain Innovation Hub); open access |
| S3 | Strnad, J. "Economic DAO Governance: A Contestable Control Approach." arXiv:2403.16980 (v4, Dec 2024); published in *Blockchain Research and Applications* (2025) | [arXiv abstract](https://arxiv.org/abs/2403.16980) | Abstract + body-text quotes; bibliography not machine-readable in our fetch (see Flag 3) |
| S4 | Buterin, V. (2021). "Moving beyond coin voting governance." vitalik.ca, 2021-08-16 | [vitalik.ca](https://vitalik.ca/general/2021/08/16/voting3.html) | Title, URL path date and core claims confirmed via search index of the post |
| S5 | talentDAO. "DAO Health Survey" (NoDW #3, Apr 2022) and "DAO Health Pulse" (NoDW #16, Aug 2023) | [NoDW #3](https://talentdao.substack.com/p/nodw-3-developing-the-dao-health) · [NoDW #16](https://talentdao.substack.com/p/nodw-16-developing-the-dao-health) | talentDAO's own newsletter. **The brief's "Worker Compensation Study" could not be located** (see TalentDAO note) |

## Paper-backed facts

**F1. [S1] DAO governance is proposal-and-vote based and is studied as distinct from
traditional corporate governance; the literature catalogues multiple novel voting
models.**
- Supports: picking a non-default voting rule is a recognised design space, not a hack.
- Does not support: one-person-one-vote specifically — the review describes the space;
  our pick within it is ours (D3).

**F2. [S1] The whale agency problem: large token holders' interests may diverge from
those of smaller token holders and users, and concentrated ownership produces governance
vulnerabilities.**
- Supports: token-weighted voting structurally favours capital over labour.
- Limit: stated about token holders vs users, not employees; we extend it to payroll (D5).

**F3. [S3] Token voting carries documented entrenchment dangers: explicit control via
accumulating a large token position, and implicit control via chronically low voter
participation; plus empty voting and vote buying (Strnad cites Buterin (2021) on vote
buying and an equity-swap-style empty-voting example).**
- Supports: token-weighted control has named failure modes we are designing against.

**F4. [S4] Buterin argues coin voting risks plutocracy and hostile takeovers
(Steem → Hive) and analyses vote buying; the post's thesis is to move beyond coin
voting.**
- Supports: an authoritative practitioner case against token-weighted governance.

**F5. [S2] Compensation design in DAOs is treated as an open design problem; Davidson
proposes vesting tied to value accrual to the underlying asset rather than to time.**
- Supports: pay mechanics are a first-class governance question, and time-based reward
  schedules are already considered misaligned in DAO-compensation writing.
- Limits: a normative proposal about token *vesting*; not an empirical study; says nothing
  about stablecoin wages or voting on pay levels. Our stablecoin choice (D1) is not from
  this paper.

**F6. [S5] talentDAO's verified research programme measures DAO organisational health —
engagement, supportive culture, aligned values, communication — and links organisational
health to outcomes including turnover, staffing, productivity and performance (DAO Health
Survey; DAO Health Pulse).**
- Supports (weakly, with the limitations below): contributor engagement is measurable and
  design-linked.
- Does not support: the specific brief claim that "pay governance affects engagement,
  performance and retention" — no such published study could be located (see TalentDAO
  note).

**F7. [S1 + S3 + S4] Synthesis: across the three governance sources the recurring risk
object is money-weighted control — whales (S1), entrenched large holders and low turnout
(S3), plutocracy and takeovers (S4).**
- Supports: our differentiator attacks exactly the axis the literature keeps flagging.

## Our design inferences (never cite a paper for these)

- **D1.** Pay in a stablecoin from a ring-fenced, publicly verifiable payroll vault.
- **D2.** Votes change only future pay; wages already earned are immutable on-chain.
- **D3.** One employee, one vote (chosen *because of* F2–F4, not *claimed by* them).
- **D4.** Working capital lives in a separate vault with no path into payroll decisions.
- **D5.** The board offers two work packages (high work/high pay vs low); employees vote —
  the work-versus-pay tradeoff itself becomes the governed object.
- **D6.** Employees withdraw accrued wages (pull payments); the protocol never pushes pay.

**Honesty note:** none of S1–S4 studies employee payroll governance inside an operating
company; they analyse token-holder governance. The move from "DAO governance research" to
"employee payroll" is D1–D6 and is labelled as ours everywhere.

## TalentDAO note and limitations

Three targeted searches plus talentDAO's own site and newsletter did not surface a
published "Worker Compensation Study." What is verifiable: the DAO Health Survey and
DAO Health Pulse, and the talentDAO manifesto arguing that workers' pay has disconnected
from productivity (NoDW #1, Feb 2022).

Limitations of the verifiable adjacent work: small, self-selected member samples;
self-reported perceptions; organisational-psychology constructs rather than pay outcomes;
project reports rather than peer-reviewed studies. Pitch usage: cite the verified work
only for "engagement is measurable and design-linked"; treat the pay-governance-specific
claim as directional and say so if a judge asks.

## Slide mapping (single-slide-ready)

| Research says | So we built |
|---|---|
| Token-weighted voting hands power to whales; concentrated control is a documented governance vulnerability (S1, S3, S4) | One employee, one vote |
| Token voting entrenches control and invites vote buying / empty voting (S3, S4) | Votes change only future pay — earned wages are out of every vote's reach |
| DAO pay design is an open governance problem; time-based schedules misalign (S2) | Pay in a stablecoin from a ring-fenced payroll vault anyone can audit |
| DAO governance research centres token holders; contributor engagement is measurable and design-linked (S1 scope; S5) | The work-versus-pay tradeoff is the governed object: board offers two packages, employees vote |

## Flags (contradictions, conflations, gaps)

1. **Year.** The brief said "SSRN/ECGI, 2024." S1's manuscript is dated Nov 3, 2024, but
   SSRN first posted it Feb 4, 2025, and it is published in *Journal of Corporate Finance*
   (2025). Cite 2025/JCF; mention 2024 only as the manuscript date.
2. **Sibling paper.** The same authors also have "DAO Governance" (SSRN 4346581; ECGI
   Finance WP 1119/2025; Management Science forthcoming) — a different, theoretical paper
   using 2020–2024 DAO voting data. Its ownership-concentration finding reinforces F2 but
   is not the paper the brief cites. Do not merge the two.
3. **Strnad's Buterin entry.** S3's body cites "Buterin (2021)" for vote buying and the
   equity-swap empty-voting example; our PDF fetch could not resolve the bibliography
   entry to confirm it is the "Moving beyond coin voting governance" post. Cite Buterin
   (S4) directly rather than "as referenced in Strnad."
4. **Native-token pay.** "Contributors are often paid in the DAO's native token" is a
   common industry observation, not a claim from S2. Use it as our problem statement (D1),
   not as a citation.
5. **Employees vs token holders.** No cited source covers employee payroll voting; the
   application layer is entirely D1–D6.
6. **talentDAO "Worker Compensation Study."** Unverified (see note above). If it stays in
   the deck, attribute nothing quantitative to it.
