import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight, ChevronDown, Scale, ShieldCheck } from "lucide-react";

const findings = [
  { source: "Han, Lee & Li · DAO governance review", finding: "Token-weighted governance can let capital concentration dominate the people doing the work.", build: "One employee, one vote — not one token, one vote." },
  { source: "DAO compensation literature", finding: "Native-token compensation couples a contributor’s livelihood to token-market volatility.", build: "Stablecoin-denominated pay, with streams anyone can verify." },
  { source: "TalentDAO · adjacent evidence only", finding: "Its locatable work covers organizational health, not payroll governance. Retention benefits remain a hypothesis.", build: "Employees choose the tradeoff; we do not claim proven retention gains." },
  { source: "Contestable control · design inference", finding: "We infer that payroll authority should be narrow and inspectable; the paper does not test this payroll design.", build: "Earned pay is untouchable; reserves and future commitments are public." },
];
const questions = [
  { q: "What stops employees voting for pay the company cannot afford?", a: "A vote cannot mint reserves. Today the contract separates accrued-wage backing from forward-runway backing, exposes shortfalls, and never overdraws; it does not reject an underfunded winning package. A reserve gate, longer runway policy, and board accountability are the next hardening steps." },
  { q: "Why a DAO instead of a normal payroll product with a survey?", a: "Because the decision and its execution share the same enforceable rules. Employees are not advising a company that can ignore the result; the vote updates future streams, while the payroll vault prevents treasury from reaching earned wages." },
  { q: "Who handles employment law, tax, and stablecoin risk?", a: "The prototype does not claim to solve those. The next step is jurisdiction-specific counsel, an appropriate legal wrapper, compliant payroll and tax operations, and a reserve policy that accounts for stablecoin and operational risk." },
];

export default function PitchPage() {
  return (
    <div className="site-shell">
      <header className="site-header"><div className="container header-inner">
        <Link className="brand" href="/" aria-label="Pact home"><span className="brand-mark"><ShieldCheck size={19} /></span><span className="brand-word">pact</span><span className="brand-tag">work, on shared terms</span></Link>
        <div className="header-actions"><span className="demo-badge"><Scale size={11} /> Research &amp; roadmap</span></div>
      </div></header>
      <main className="pitch-main"><div className="container">
        <Link className="back-link" href="/"><ArrowLeft size={13} /> Back to the employee demo</Link>
        <article className="pitch-slide" aria-labelledby="pitch-title">
          <header className="pitch-hero">
            <div><p className="eyebrow">Pact · one-slide research pitch</p><h1 id="pitch-title">Research says <span>X.</span><br />So we built <span>Y.</span></h1></div>
            <div className="pitch-thesis"><strong>Employees get no say in the work-versus-pay tradeoff, and payroll risk sits on them.</strong><br /><br />Pact gives them a bounded vote over future terms and takes wage custody out of company discretion. The DAO is just the mechanism.</div>
          </header>
          <div className="pitch-table">
            {findings.map((item) => <div className="pitch-row" key={item.source}><div><div className="pitch-source-label">{item.source}</div><div className="pitch-finding">{item.finding}</div></div><span className="pitch-arrow"><ArrowRight size={15} /></span><div className="pitch-build">{item.build}</div></div>)}
          </div>
          <footer className="pitch-citations">
            <a href="https://papers.ssrn.com/sol3/papers.cfm?abstract_id=5074046" target="_blank" rel="noreferrer">Han, Lee &amp; Li, A Review of DAO Governance <ArrowUpRight size={9} /></a>
            <a href="https://doi.org/10.31585/jbba-6-2-(4)2023" target="_blank" rel="noreferrer">Davidson, Compensation in DAOs: A Proposal <ArrowUpRight size={9} /></a>
            <a href="https://arxiv.org/abs/2403.16980" target="_blank" rel="noreferrer">Strnad, Economic DAO Governance <ArrowUpRight size={9} /></a>
            <a href="https://vitalik.eth.limo/general/2021/08/16/voting3.html" target="_blank" rel="noreferrer">Buterin, Moving beyond coin voting governance <ArrowUpRight size={9} /></a>
            <a href="https://talentdao.substack.com/p/nodw-16-developing-the-dao-health" target="_blank" rel="noreferrer">TalentDAO Health Pulse (adjacent evidence; compensation study unverified) <ArrowUpRight size={9} /></a>
          </footer>
        </article>
        <div className="pitch-support-grid">
          <section className="card pitch-panel"><p className="card-kicker">Judge-ready answers</p><h2>The three hard questions</h2>
            {questions.map((item) => <details className="judge-question" key={item.q}><summary>{item.q}<ChevronDown size={14} /></summary><p>{item.a}</p></details>)}
          </section>
          <section className="card pitch-panel"><p className="card-kicker">Legal is a roadmap, not a footnote</p><h2>From prototype to company</h2>
            <div className="roadmap-step"><span className="roadmap-number">01</span><div><strong>Now · verifiable mechanism</strong><p>Local Solidity prototype: member voting, separate vaults, future-only rates, and pull-based stablecoin pay.</p></div></div>
            <div className="roadmap-step"><span className="roadmap-number">02</span><div><strong>Next · retain specialist counsel</strong><p>Choose the jurisdiction and wrapper: LLC, association, foundation, cooperative, or an existing employer entity with an on-chain governance layer.</p></div></div>
            <div className="roadmap-step"><span className="roadmap-number">03</span><div><strong>Then · compliant operations</strong><p>Map employment status, wage rules, tax withholding, benefits, securities, sanctions, custody, and stablecoin requirements before paying real workers.</p></div></div>
            <p className="legal-note">Roadmap only, not legal advice. Wrapper availability and regulatory treatment depend on jurisdiction, worker relationships, token design, and actual operations.</p>
          </section>
        </div>
      </div></main>
    </div>
  );
}
