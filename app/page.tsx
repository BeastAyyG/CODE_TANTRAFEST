import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  FileCheck2,
  Info,
  ShieldAlert,
  Wallet,
} from "lucide-react";
import { getDemo } from "@/lib/demo";
import { StagePipeline } from "@/components/StagePipeline";
import { SourceChip } from "@/components/SourceChip";
import {
  ArrowLink,
  HashLine,
  KeyValue,
  ModelBadge,
  Panel,
  RiskMeter,
  SectionHeader,
  StatusPill,
  cn,
} from "@/components/ui";
import { formatNumber, formatPercent, shortAddress, shortHex } from "@/packages/shared/format";

export default function Home() {
  const demo = getDemo();
  const main = demo.mainRun;
  const tentativeUpgrade = demo.extracted.actions.find((action) => action.kind === "UPGRADE");
  const queued = main.submitted[0];

  const blockers = [
    {
      label: "executor",
      value: main.code,
      tone: "danger" as const,
      href: `/arena/${main.scenario.id}`,
    },
    {
      label: "disclosure",
      value: "undisclosed funder link",
      tone: "danger" as const,
      href: "/graph",
    },
    {
      label: "vote",
      value: `${formatPercent(demo.voting.metrics.informedRatio)} informed`,
      tone: "warn" as const,
      href: "/vote",
    },
  ];

  return (
    <div className="space-y-9">
      <section>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger/30 bg-danger/6 px-4 py-2.5">
          <div className="flex items-center gap-2.5">
            <span className="status-dot text-danger pulse-danger" />
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-danger">
              Execution blocked
            </span>
            <span className="hidden h-3 w-px bg-danger/30 sm:block" />
            <span className="text-[11.5px] text-dim">
              The queued transaction was rejected at the executor. A disclosure challenge is open.
            </span>
          </div>
          <Link
            href={`/arena/${main.scenario.id}`}
            className="inline-flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-danger hover:text-[#ff9d9d]"
          >
            open violation report <ArrowUpRight size={11} />
          </Link>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.45fr_0.8fr]">
          <div className="flex flex-col justify-between gap-6 py-1">
            <div>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className="mono-label text-signal">AIP-042 · Decision Trail</span>
                <span className="chip">25 oct 2026</span>
                <ModelBadge />
              </div>
              <h1 className="max-w-3xl text-balance text-[34px] font-semibold leading-[1.02] tracking-[-0.035em] text-body sm:text-[44px] lg:text-[52px]">
                The proposal passed.
                <br />
                <span className="text-danger">The transaction doesn&apos;t match it.</span>
              </h1>
              <p className="mt-5 max-w-2xl text-[14px] leading-relaxed text-dim">
                AIP-042 authorized two one-time grants and a bounded allowance. The queued call
                upgrades the treasury proxy. The executor rejects it, the wallet graph finds an
                undisclosed funding path, and only{" "}
                <span className="text-body">{formatPercent(demo.voting.metrics.informedRatio)}</span>{" "}
                of voting weight recorded that it had read the risk brief.
              </p>
              <p className="mt-2 max-w-2xl text-[12px] leading-relaxed text-faint">
                Four independent stages. One hard gate. The decision is not the vote — it is the
                exact calldata the vote binds to.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/arena/${main.scenario.id}`} className="btn btn-primary">
                <ShieldAlert size={13} strokeWidth={1.9} />
                Open violation report
              </Link>
              <Link href="/intent" className="btn">
                Review the intent
              </Link>
              <Link href="/arena" className="btn">
                Run the arena
              </Link>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              {blockers.map((blocker) => (
                <Link
                  key={blocker.label}
                  href={blocker.href}
                  className={cn(
                    "group rounded-lg border px-3 py-2.5 transition-colors",
                    blocker.tone === "danger"
                      ? "border-danger/25 bg-danger/4 hover:border-danger/45"
                      : "border-signal/25 bg-signal/4 hover:border-signal/45",
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        blocker.tone === "danger" ? "bg-danger" : "bg-signal",
                      )}
                    />
                    <span className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-faint">
                      {blocker.label}
                    </span>
                    <ArrowUpRight
                      size={10}
                      className="ml-auto text-faint transition-colors group-hover:text-body"
                    />
                  </div>
                  <div
                    className={cn(
                      "mt-1.5 truncate font-mono text-[10.5px] uppercase tracking-[0.04em]",
                      blocker.tone === "danger" ? "text-danger" : "text-signal",
                    )}
                  >
                    {blocker.value}
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <Panel className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-edge px-4 py-3">
              <span className="mono-label">Proposal dossier</span>
              <StatusPill status="REJECTED">queued · blocked</StatusPill>
            </div>
            <div className="p-4">
              <div className="mono-label">Requested</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-mono text-[30px] leading-none tracking-tight text-body">
                  {formatNumber(Number(demo.proposal.requestedUsdc), 0)}
                </span>
                <span className="font-mono text-[11px] text-dim">USDC</span>
              </div>
              <div className="mt-4 space-y-2.5">
                {demo.proposal.recipients.map((recipient) => (
                  <div key={recipient.address} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Wallet size={12} className="text-faint" />
                      <span className="text-[11.5px] text-dim">{recipient.name}</span>
                    </div>
                    <span className="font-mono text-[10.5px] text-steel">
                      {formatNumber(Number(recipient.amountUsdc), 0)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="my-4 hairline" />

              <KeyValue label="Proposer">
                <span className="text-[11.5px]">{demo.proposal.proposer.name}</span>
              </KeyValue>
              <KeyValue label="Versions">
                <span className="font-mono text-[11px]">{demo.versions.length} · hash-chained</span>
              </KeyValue>
              <KeyValue label="Timelock">
                <span className="font-mono text-[10.5px] uppercase text-signal">elapsed · attempt rejected</span>
              </KeyValue>
              <KeyValue label="Disclosure">
                <span className="font-mono text-[10.5px] uppercase text-danger">challenge filed</span>
              </KeyValue>

              <div className="mt-3">
                <HashLine label="Committed intent hash" value={demo.intentHash} />
                <HashLine label="Evidence root" value={demo.manifest.root} />
              </div>

              <div className="mt-3 flex items-center justify-between gap-2 rounded border border-danger/25 bg-danger/5 px-2.5 py-2">
                <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-danger">
                  execution attempt
                </span>
                <span className="font-mono text-[9px] text-dim">
                  25 Oct · 07:58 UTC · {shortHex(main.txHash ?? "0x", 5)}
                </span>
              </div>
            </div>
          </Panel>
        </div>
      </section>

      <section>
        <SectionHeader
          eyebrow="The pipeline"
          title="Decision Trail"
          description="Claims → COI → Voting → Execution. Every number has a drilldown; execution is a binary gate, not a weighted average."
          right={
            <div className="flex items-center gap-2">
              <span className="chip">4 stages</span>
              <span className="chip border-danger/30 text-danger">1 blocked</span>
            </div>
          }
        />
        <StagePipeline stages={demo.chain.stages} />
      </section>

      <section>
        <SectionHeader
          eyebrow="The gap"
          title="Said one thing. Would do another."
          description="The proposal used implementation language but authorized no upgrade. The decoder shows the queued call exactly as the executor sees it."
          right={<ArrowLink href={`/arena/${main.scenario.id}`}>Full report</ArrowLink>}
        />
        <div className="grid items-stretch gap-3 lg:grid-cols-[1fr_auto_1fr]">
          <Panel className="flex flex-col p-5">
            <div className="flex items-center justify-between gap-2">
              <span className="mono-label">The proposal said</span>
              <span className="chip">§5 · implementation note</span>
            </div>
            <blockquote className="mt-4 flex-1 text-[19px] font-medium leading-[1.45] tracking-[-0.01em] text-body">
              &ldquo;We will align the treasury implementation with the program&apos;s delivery
              roadmap during the grant period.&rdquo;
            </blockquote>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {tentativeUpgrade ? <SourceChip source={tentativeUpgrade.source} /> : null}
              <span className="text-[10.5px] text-faint">
                Jargon, not a rule. No upgrade appears in the committed intent.
              </span>
            </div>
          </Panel>

          <div className="hidden items-center justify-center lg:flex">
            <div className="grid size-9 place-items-center rounded-full border border-danger/40 bg-danger/8 text-danger">
              <ArrowRight size={15} />
            </div>
          </div>

          <Panel className="flex flex-col border-danger/25 p-5">
            <div className="flex items-center justify-between gap-2">
              <span className="mono-label text-danger">The queued call would do</span>
              <StatusPill status={main.status}>{main.status}</StatusPill>
            </div>
            <div className="mt-4 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="font-mono text-[15px] text-danger">{queued?.function}</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-faint">
                  on {queued?.targetLabel}
                </span>
              </div>
              <p className="mt-2 text-[17px] leading-snug text-body">{queued?.humanText}</p>
              <div className="mt-4 grid gap-2 font-mono text-[10px] uppercase tracking-[0.06em] text-faint sm:grid-cols-2">
                <div className="rounded border border-edge bg-ink/40 px-2.5 py-2">
                  <div className="text-[8.5px] tracking-[0.12em]">target</div>
                  <div className="mt-1 normal-case text-steel">{shortAddress(queued?.target ?? "0x")}</div>
                </div>
                <div className="rounded border border-edge bg-ink/40 px-2.5 py-2">
                  <div className="text-[8.5px] tracking-[0.12em]">new implementation</div>
                  <div className="mt-1 normal-case text-steel">
                    {shortAddress(queued?.args.arg0 ?? "0x")}
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-4 rounded border border-danger/25 bg-danger/5 px-3 py-2 text-[11px] leading-relaxed text-dim">
              <span className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-danger">
                {main.code}
              </span>
              <span className="mx-2 text-faint">·</span>
              upgradeTo was never in the commitment.
            </div>
          </Panel>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Panel className="p-4">
          <div className="flex items-center justify-between">
            <span className="mono-label">Attention queue</span>
            <ArrowLink href="/vote">Vote</ArrowLink>
          </div>
          <div className="mt-3 space-y-2">
            {demo.attention.map((proposal) => {
              const danger = proposal.execution === "RED";
              return (
                <div
                  key={proposal.id}
                  className={cn(
                    "rounded-lg border px-3 py-2.5",
                    proposal.youAreHere
                      ? "border-danger/30 bg-danger/4"
                      : "border-edge bg-white/[0.012]",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[9.5px] text-faint">{proposal.id}</span>
                      <span className="text-[11.5px] text-body">{proposal.title}</span>
                    </div>
                    <span
                      className={cn(
                        "font-mono text-[8.5px] uppercase tracking-[0.08em]",
                        danger ? "text-danger" : proposal.execution === "AMBER" ? "text-signal" : "text-safe",
                      )}
                    >
                      {proposal.state}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <RiskMeter
                      value={proposal.coi}
                      status={proposal.coi >= 0.65 ? "RED" : proposal.coi >= 0.35 ? "AMBER" : "GREEN"}
                      className="flex-1"
                    />
                    <span className="font-mono text-[8.5px] text-faint">COI {proposal.coi.toFixed(2)}</span>
                  </div>
                  {proposal.youAreHere ? (
                    <div className="mt-1.5 font-mono text-[8.5px] uppercase tracking-[0.1em] text-danger">
                      ← you are here
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel className="p-4">
          <div className="flex items-center justify-between">
            <span className="mono-label">Evidence integrity</span>
            <ArrowLink href="/timeline">Timeline</ArrowLink>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-md border border-safe/25 bg-safe/6 text-safe">
              <FileCheck2 size={18} strokeWidth={1.7} />
            </div>
            <div>
              <div className="text-[13px] font-medium text-body">4 documents anchored</div>
              <div className="text-[10.5px] text-faint">Merkle root committed with v3</div>
            </div>
          </div>
          <div className="mt-3 grid gap-1.5">
            {demo.manifest.docs.map((doc) => (
              <div key={doc.key} className="flex items-center justify-between gap-2 text-[10.5px]">
                <span className="truncate text-dim">{doc.title}</span>
                <span className="shrink-0 font-mono text-[9px] text-faint">{shortHex(doc.docHash, 4)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-edge/70 pt-2.5">
            <span className="mono-label">Wallet disclosure</span>
            <span className="font-mono text-[9.5px] uppercase text-danger">2 disclosed · 3 discovered</span>
          </div>
        </Panel>

        <Panel className="p-4">
          <div className="flex items-center justify-between">
            <span className="mono-label">Demo path</span>
            <span className="chip">~5 min</span>
          </div>
          <ol className="mt-3 space-y-1.5">
            {[
              { href: "/intent", label: "Resolve two ambiguities", note: "intent hash changes live" },
              { href: "/graph", label: "Inspect the wallet graph", note: "undisclosed funder link" },
              { href: "/vote", label: "Read the risk brief", note: "informed vote receipt" },
              { href: "/arena", label: "Run the attacks", note: "executor vs sentinel layers" },
              { href: `/arena/${main.scenario.id}`, label: "Read the violation report", note: "jargon beside calldata" },
            ].map((step, index) => (
              <li key={step.href}>
                <Link
                  href={step.href}
                  className="group flex items-center gap-2.5 rounded px-1.5 py-1.5 transition-colors hover:bg-white/[0.025]"
                >
                  <span className="grid size-5 shrink-0 place-items-center rounded border border-edge font-mono text-[8.5px] text-faint group-hover:border-signal/40 group-hover:text-signal">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11.5px] text-body">{step.label}</span>
                    <span className="block truncate text-[9.5px] text-faint">{step.note}</span>
                  </span>
                  <ArrowUpRight size={11} className="shrink-0 text-faint group-hover:text-signal" />
                </Link>
              </li>
            ))}
          </ol>
        </Panel>
      </section>

      <section className="panel relative overflow-hidden px-6 py-7 sm:px-8">
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full border border-signal/10" />
        <div className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full border border-signal/10" />
        <div className="relative max-w-3xl">
          <div className="mono-label text-signal">The closing line</div>
          <p className="mt-3 text-[20px] font-medium leading-[1.4] tracking-[-0.015em] text-body sm:text-[24px]">
            Voting transparency isn&apos;t informed consent. We made the vote bind to the exact
            action, and we make the evidence, the conflicts, and the execution verifiable.
          </p>
          <p className="mt-3 text-[11px] text-faint">
            AegisDAO IntentLock · claims, COI and voting scores are advisory; execution is a hard
            gate.
          </p>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3 border-t border-edge pt-4 text-[10px] text-faint">
        <Info size={12} className="shrink-0" />
        <span>
          All wallet records are simulated. The reference executor is TypeScript; the on-chain
          Solidity guarantee is Person A&apos;s deliverable and remains TEST_REQUIRED.
        </span>
        <Link href="/scorecard" className="ml-auto inline-flex items-center gap-1 font-mono uppercase tracking-[0.08em] text-dim hover:text-signal">
          see the gaps <ArrowUpRight size={11} />
        </Link>
      </div>
    </div>
  );
}
