"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight, ArrowUpRight, BadgeCheck, BookOpen, Check, CheckCircle2,
  ChevronRight, CircleDollarSign, Clock3, Coins, Gauge, Info, Landmark,
  LockKeyhole, RotateCcw, ShieldCheck, Users, Vote, Wallet, X, Zap,
} from "lucide-react";

type PackageId = "focus" | "sprint";
type Activity = { id: number; title: string; time: string };
type DemoState = {
  currentName: string;
  currentHours: number;
  currentRate: number;
  earned: number;
  payrollAssets: number;
  wallet: number;
  votes: Record<PackageId, number>;
  userVote: PackageId | null;
  status: "open" | "executed";
  execution: { earned: number; packageId: PackageId; previousRate: number } | null;
  activities: Activity[];
};

const PACKAGES = [
  { id: "focus" as const, name: "Focus", tag: "Lower intensity", description: "More breathing room, fewer hours, and a predictable weekly rhythm.", hours: 32, rate: 72, pressure: "Sustainable pace · 4-day week" },
  { id: "sprint" as const, name: "Sprint", tag: "Higher intensity", description: "A bigger commitment and higher pay for a demanding launch month.", hours: 50, rate: 110, pressure: "High pressure · 5-day week" },
];
const OTHER_EARNED = 14_577.33;
const EMPLOYEE_COUNT = 5;
const QUORUM = 3;

function initialState(): DemoState {
  return {
    currentName: "Core", currentHours: 40, currentRate: 80,
    earned: 3_842.67, payrollAssets: 248_500, wallet: 1_240.5,
    votes: { focus: 1, sprint: 1 }, userVote: null, status: "open", execution: null,
    activities: [
      { id: 2, title: "2 employees voted anonymously", time: "10:18" },
      { id: 1, title: "Board opened proposal #007", time: "09:41" },
      { id: 0, title: "Payroll reserve attested at 286%", time: "09:40" },
    ],
  };
}

const compactMoney = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
function preciseMoney(value: number) {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 6, maximumFractionDigits: 6 })}`;
}
function splitMoney(value: number) {
  const [whole, decimals] = money.format(value).split(".");
  return { whole, decimals };
}
function timeNow() {
  return new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function PayrollDemo() {
  const [state, setState] = useState<DemoState>(initialState);
  const [selected, setSelected] = useState<PackageId | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const nextActivity = useRef(3);

  useEffect(() => {
    let previous = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const elapsed = (now - previous) / 1000;
      previous = now;
      setState((current) => ({ ...current, earned: current.earned + (current.currentRate * elapsed) / 3600 }));
    }, 100);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const totalVotes = state.votes.focus + state.votes.sprint;
  const winner: PackageId = state.votes.focus > state.votes.sprint ? "focus" : "sprint";
  const winnerPackage = PACKAGES.find((item) => item.id === winner)!;
  const selectedPackage = PACKAGES.find((item) => item.id === selected);
  const futureCommitment = EMPLOYEE_COUNT * state.currentHours * state.currentRate * (30 / 7);
  const totalEarned = OTHER_EARNED + state.earned;
  const liabilities = totalEarned + futureCommitment;
  const backing = (state.payrollAssets / liabilities) * 100;
  const earnedDisplay = splitMoney(state.earned);
  const activity = useMemo(() => state.activities.slice(0, 3), [state.activities]);

  function addActivity(current: DemoState, title: string): Activity[] {
    const item = { id: nextActivity.current++, title, time: timeNow() };
    return [item, ...current.activities];
  }

  function castVote() {
    if (!selected || state.userVote || state.status !== "open") return;
    const choice = selected;
    setState((current) => ({
      ...current, userVote: choice,
      votes: { ...current.votes, [choice]: current.votes[choice] + 1 },
      activities: addActivity(current, `Maya voted ${choice === "focus" ? "Focus" : "Sprint"} · vote #3 of 5`),
    }));
    setToast("Your one vote is recorded. Quorum is reached; you can now close the vote.");
  }

  function executeVote() {
    if (!state.userVote || state.status !== "open") return;
    const result = winner;
    const resultPackage = winnerPackage;
    setState((current) => ({
      ...current,
      currentName: resultPackage.name, currentHours: resultPackage.hours, currentRate: resultPackage.rate,
      status: "executed",
      execution: { earned: current.earned, packageId: result, previousRate: current.currentRate },
      activities: addActivity(current, `${resultPackage.name} passed · future pay is now $${resultPackage.rate}/hr`),
    }));
    setToast(`${resultPackage.name} passed. Your earned balance was preserved; only future accrual changed.`);
  }

  function withdraw() {
    if (state.earned <= 0) return;
    setState((current) => {
      const amount = current.earned;
      return {
        ...current, earned: 0, payrollAssets: current.payrollAssets - amount, wallet: current.wallet + amount,
        activities: addActivity(current, `${money.format(amount)} USDC withdrawn to Maya's wallet`),
      };
    });
    setToast("Demo withdrawal complete. Working capital stayed separate and untouched.");
  }

  function reset() {
    setState(initialState());
    setSelected(null);
    setToast("Demo reset. You can try the other work package.");
    nextActivity.current = 3;
  }

  return (
    <div className="site-shell">
      <header className="site-header">
        <div className="container header-inner">
          <Link className="brand" href="/" aria-label="Pact home">
            <span className="brand-mark"><ShieldCheck size={19} strokeWidth={2.2} /></span>
            <span className="brand-word">pact</span><span className="brand-tag">work, on shared terms</span>
          </Link>
          <nav className="main-nav" aria-label="Main navigation">
            <a href="#my-work">My work</a><a href="#payroll-vault">Payroll vault</a><Link href="/pitch">Research &amp; pitch</Link>
          </nav>
          <div className="header-actions">
            <span className="demo-badge"><span className="live-dot" /> Guided demo</span>
            <button className="icon-button" onClick={reset} aria-label="Reset demo" title="Reset demo"><RotateCcw size={14} /></button>
            <span className="avatar" title="Maya Chen, employee #01">MC</span>
          </div>
        </div>
      </header>

      <main>
        <section className="hero"><div className="container"><div className="hero-grid">
          <div>
            <p className="eyebrow"><span className="eyebrow-line" /> The employee-governed company</p>
            <h1>A say in the work.<br /><span className="accent-word">Certainty</span> in the pay.</h1>
            <p className="hero-copy">Choose the pace together. See every future dollar backed. And keep every dollar you have already earned.</p>
            <div className="principles">
              <span className="principle"><Users size={13} /> One employee, one vote</span>
              <span className="principle"><Coins size={13} /> USDC-denominated pay</span>
              <span className="principle"><LockKeyhole size={13} /> Earned means yours</span>
            </div>
          </div>
          <aside className="promise-card">
            <div className="promise-icon"><LockKeyhole size={19} /></div>
            <blockquote>“A vote can change tomorrow’s plan. It cannot rewrite yesterday’s work.”</blockquote>
            <footer>The Pact payroll promise · enforced by contract, not goodwill</footer>
          </aside>
        </div></div></section>

        <div className="container" id="my-work">
          <div className="demo-strip">
            <span className="demo-strip-icon"><Zap size={15} /></span>
            <p><strong>You’re Maya, employee #01.</strong> Vote on next month’s work package, apply the result, then withdraw your pay.</p>
            <span className="strip-note">No wallet needed · about 2 minutes</span>
          </div>

          <div className="dashboard-grid">
            <section className="card vote-card" aria-labelledby="proposal-title">
              <div className="card-header">
                <div>
                  <p className="card-kicker">Proposal #007 · October work terms</p>
                  <h2 className="card-title" id="proposal-title">How should we work next month?</h2>
                  <p className="card-description">Two board-drafted packages. One employee, one vote. The winning terms apply to future work only.</p>
                </div>
                <span className={`status-pill ${state.status === "executed" ? "passed" : ""}`}>
                  {state.status === "executed" ? <CheckCircle2 size={11} /> : <Clock3 size={11} />}
                  {state.status === "executed" ? "Passed" : "Voting open"}
                </span>
              </div>
              <div className="package-grid" role="radiogroup" aria-label="Work package choices">
                {PACKAGES.map((item) => {
                  const isSelected = selected === item.id;
                  const isVoted = state.userVote === item.id;
                  return (
                    <button key={item.id} className={`package-option ${isSelected ? "selected" : ""} ${isVoted ? "voted" : ""}`}
                      role="radio" aria-checked={isSelected || isVoted} disabled={Boolean(state.userVote) || state.status !== "open"} onClick={() => setSelected(item.id)}>
                      <div className="package-topline"><span className="package-label"><span className="radio-dot" />{item.name}</span><span className={`package-tag ${item.id === "sprint" ? "sprint" : ""}`}>{item.tag}</span></div>
                      <p className="package-description">{item.description}</p>
                      <div className="package-numbers">
                        <div className="package-number"><strong>{item.hours}h</strong><span>per week</span></div>
                        <div className="package-number"><strong>${item.rate}</strong><span>per hour</span></div>
                        <div className="package-number"><strong>{compactMoney.format(item.hours * item.rate)}</strong><span>per week</span></div>
                      </div>
                      <div className="package-pressure"><Gauge size={12} />{item.pressure}</div>
                    </button>
                  );
                })}
              </div>
              <div className="vote-meta"><span><strong>{totalVotes} of {EMPLOYEE_COUNT}</strong> employee votes · {state.votes.focus} Focus / {state.votes.sprint} Sprint</span><span>Quorum: {QUORUM}</span></div>
              <div className="vote-track" aria-label={`${totalVotes} of ${EMPLOYEE_COUNT} votes cast`}><span style={{ width: `${(totalVotes / EMPLOYEE_COUNT) * 100}%` }} /></div>
              {state.status === "open" ? (
                <div className="vote-actions">
                  {!state.userVote ? (
                    <><button className="primary-button" onClick={castVote} disabled={!selected}><Vote size={14} /> Cast my one vote <ArrowRight size={13} /></button><span className="vote-hint">{selectedPackage ? `${selectedPackage.name} selected` : "Select a package to vote"}</span></>
                  ) : (
                    <><button className="primary-button" onClick={executeVote}><Check size={14} /> Close vote &amp; apply {winnerPackage.name}</button><span className="vote-hint">Quorum reached · {winnerPackage.name} leads {state.votes[winner]}–{state.votes[winner === "focus" ? "sprint" : "focus"]}</span></>
                  )}
                </div>
              ) : (
                <div className="result-banner"><BadgeCheck size={16} /><span><strong>{winnerPackage.name} is now active.</strong> At execution, {money.format(state.execution?.earned ?? 0)} of earned pay stayed yours. Your future rate moved from ${state.execution?.previousRate}/hr to ${state.currentRate}/hr.</span></div>
              )}
            </section>

            <div className="side-stack">
              <section className="card pay-card" aria-labelledby="pay-title">
                <div className="pay-heading"><p className="card-kicker" id="pay-title">Maya’s payroll</p><span className="streaming-pill"><span className="live-dot" /> Streaming</span></div>
                <p className="earned-label">Earned &amp; available</p>
                <p className="earned-amount" aria-live="off">{earnedDisplay.whole}.<span className="decimals">{earnedDisplay.decimals}</span></p>
                <div className="earned-precise">{preciseMoney(state.earned)} USDC</div>
                <div className="rate-row"><span>{state.currentName} package · {state.currentHours}h/week</span><strong className="rate-live"><Zap size={11} /> ${state.currentRate.toFixed(2)}/hr</strong></div>
                <button className="primary-button withdraw-button" onClick={withdraw} disabled={state.earned < 0.000001}><Wallet size={14} /> Withdraw demo pay <ArrowUpRight size={13} /></button>
                <p className="wallet-line">Demo wallet · {money.format(state.wallet)} USDC</p>
              </section>
              <aside className="card guarantee-card"><span className="guarantee-icon"><ShieldCheck size={17} /></span><div><h3>Past work is off the table.</h3><p>Votes only set <strong>future rates</strong>. Earned, unwithdrawn pay cannot be reduced, redirected, or clawed back.</p></div></aside>
            </div>
          </div>

          <section className="card vault-section" id="payroll-vault" aria-labelledby="vault-title">
            <div className="section-heading">
              <div><p className="card-kicker">Public reserve view</p><h2 id="vault-title">Two vaults. One hard boundary.</h2><p>Payroll is backed in stablecoins and separated from company spending. The reserve covers earned pay plus the next 30 days at the elected rates.</p></div>
              <div className="coverage-badge"><strong>{Math.round(backing)}%</strong><span>Reserve coverage · fully backed</span></div>
            </div>
            <div className="vault-layout">
              <div className="reserve-visual">
                <div className="reserve-row"><span className="reserve-label"><Landmark size={13} /> Payroll assets</span><div className="reserve-track"><div className="reserve-fill" style={{ width: "100%" }} /></div><span className="reserve-value">{compactMoney.format(state.payrollAssets)}</span></div>
                <div className="reserve-row"><span className="reserve-label"><BadgeCheck size={13} /> Earned, unpaid</span><div className="reserve-track"><div className="reserve-fill earned" style={{ width: `${(totalEarned / state.payrollAssets) * 100}%` }} /></div><span className="reserve-value">{compactMoney.format(totalEarned)}</span></div>
                <div className="reserve-row"><span className="reserve-label"><Clock3 size={13} /> Next 30 days</span><div className="reserve-track"><div className="reserve-fill future" style={{ width: `${(futureCommitment / state.payrollAssets) * 100}%` }} /></div><span className="reserve-value">{compactMoney.format(futureCommitment)}</span></div>
                <p className="reserve-note"><Info size={12} /> Coverage = liquid payroll USDC ÷ (earned, unwithdrawn pay + 30-day forward commitments). Anyone can query these balances from the payroll contract in the on-chain demo.</p>
              </div>
              <div className="vault-boundary">
                <div className="mini-vault payroll"><div className="mini-vault-head"><span className="mini-vault-title"><LockKeyhole size={13} /> Payroll vault</span><span className="mini-vault-tag">Ring-fenced</span></div><div className="mini-vault-amount">{compactMoney.format(state.payrollAssets)}</div><p>USDC · employee withdrawals and payroll top-ups only</p></div>
                <div className="boundary-label"><LockKeyhole size={10} /> No treasury withdrawals</div>
                <div className="mini-vault"><div className="mini-vault-head"><span className="mini-vault-title"><CircleDollarSign size={13} /> Working capital</span><span className="mini-vault-tag">Separate</span></div><div className="mini-vault-amount">$614,250</div><p>USDC · operations, vendors, and payroll funding</p></div>
              </div>
            </div>
          </section>

          <section className="card activity-section" aria-labelledby="activity-title">
            <div className="card-header"><div><p className="card-kicker">A receipt for every decision</p><h2 className="card-title" id="activity-title">Your demo trail</h2></div><span className="demo-badge"><CheckCircle2 size={11} /> Rules enforced</span></div>
            <ul className="activity-list" aria-live="polite">
              {activity.map((item) => <li className="activity-item" key={item.id}><span className="activity-icon"><Check size={13} /></span><div className="activity-copy"><strong>{item.title}</strong><time>{item.time} · proposal #007</time></div></li>)}
            </ul>
          </section>

          <section className="research-callout">
            <div><p className="eyebrow"><BookOpen size={13} /> Evidence → product</p><h2>Not a token experiment. A payroll promise.</h2><p className="lead">The DAO is only the mechanism. The point is employee agency without putting wages at risk.</p><Link className="text-button" href="/pitch">See the one-slide research pitch <ArrowRight size={14} /></Link></div>
            <div className="research-list">
              <div className="research-row"><span>Capital-weighted voting can concentrate control.</span><ChevronRight size={14} /><strong>One employee, one vote.</strong></div>
              <div className="research-row"><span>Native-token pay exposes contributors to price swings.</span><ChevronRight size={14} /><strong>Pay denominated in USDC.</strong></div>
              <div className="research-row"><span>Payroll risk should not sit with workers.</span><ChevronRight size={14} /><strong>Ring-fenced, verifiable reserves.</strong></div>
            </div>
          </section>
        </div>
      </main>

      <footer className="site-footer"><div className="container footer-inner"><span className="footer-brand">pact</span><p>Guided browser demo with simulated balances. The repository includes tested Solidity contracts and a Hardhat script that execute these rules on-chain. Prototype only — not audited, not legal or financial advice.</p><Link className="text-button" href="/pitch">Research &amp; roadmap <ArrowUpRight size={12} /></Link></div></footer>
      {toast ? <div className="toast" role="status"><CheckCircle2 size={16} /><span>{toast}</span><button onClick={() => setToast(null)} aria-label="Dismiss notification"><X size={14} /></button></div> : null}
    </div>
  );
}
