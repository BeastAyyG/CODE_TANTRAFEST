"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  CheckCircle2,
  CircleDashed,
  FileJson,
  ShieldAlert,
  Terminal,
  XCircle,
} from "lucide-react";
import scorecardJson from "@/packages/shared/fixtures/scorecard.json";
import metaJson from "@/packages/shared/fixtures/scorecard-meta.json";
import type { ScorecardEntry } from "@/packages/shared/schemas";
import { formatTimestamp, shortHex } from "@/packages/shared/format";
import { computeDocHash } from "@/packages/shared/hash";
import { CopyButton } from "@/components/CopyButton";
import {
  Callout,
  Panel,
  SectionHeader,
  StatusPill,
  cn,
} from "@/components/ui";

const entries = scorecardJson as unknown as ScorecardEntry[];
const digest = computeDocHash(JSON.stringify(entries));
const meta = metaJson as unknown as {
  generatedAt: string;
  generator: string;
  mode: string;
  summary: { pass: number; fail: number; testRequired: number };
  note: string;
};

type Filter = "ALL" | "PASS" | "FAIL" | "TEST_REQUIRED";

function groupFor(id: string): string {
  if (id.startsWith("H")) return "Hash & commitment";
  if (id.startsWith("E")) return "Evidence store";
  if (id.startsWith("D")) return "Decoder";
  if (id.startsWith("S")) return "Red-team scenarios";
  if (id.startsWith("P")) return "On-chain guarantee";
  return "Engine & reports";
}

function EvidenceKind({ kind }: { kind: ScorecardEntry["evidenceKind"] }) {
  const label =
    kind === "reference-model" ? "model" : kind === "pending-solidity" ? "solidity" : "unit";
  const style =
    kind === "pending-solidity"
      ? "border-signal/30 text-signal"
      : kind === "reference-model"
        ? "border-info/30 text-info"
        : "border-edge2 text-dim";
  return <span className={cn("chip", style)}>{label}</span>;
}

export function ScorecardView() {
  const [filter, setFilter] = useState<Filter>("ALL");
  const [rawOpen, setRawOpen] = useState(false);

  const summary = useMemo(
    () => ({
      pass: entries.filter((entry) => entry.status === "PASS").length,
      fail: entries.filter((entry) => entry.status === "FAIL").length,
      testRequired: entries.filter((entry) => entry.status === "TEST_REQUIRED").length,
    }),
    [],
  );

  const filtered = filter === "ALL" ? entries : entries.filter((entry) => entry.status === filter);
  const pending = entries.filter((entry) => entry.status === "TEST_REQUIRED");

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Panel className="p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={14} className="text-safe" />
            <span className="mono-label">Executed & passed</span>
          </div>
          <div className="mt-2 font-mono text-[28px] leading-none text-safe">{summary.pass}</div>
          <div className="mt-1.5 text-[10px] text-faint">reference model + unit checks</div>
        </Panel>
        <Panel className="p-4">
          <div className="flex items-center gap-2">
            <XCircle size={14} className={summary.fail > 0 ? "text-danger" : "text-faint"} />
            <span className="mono-label">Failed</span>
          </div>
          <div className={cn("mt-2 font-mono text-[28px] leading-none", summary.fail > 0 ? "text-danger" : "text-steel")}>
            {summary.fail}
          </div>
          <div className="mt-1.5 text-[10px] text-faint">would block the demo</div>
        </Panel>
        <Panel className="p-4">
          <div className="flex items-center gap-2">
            <CircleDashed size={14} className="text-signal" />
            <span className="mono-label">Test required</span>
          </div>
          <div className="mt-2 font-mono text-[28px] leading-none text-signal">{summary.testRequired}</div>
          <div className="mt-1.5 text-[10px] text-faint">Solidity-only · amber, never green</div>
        </Panel>
        <Panel className="p-4">
          <div className="flex items-center gap-2">
            <Terminal size={14} className="text-steel" />
            <span className="mono-label">Generated</span>
          </div>
          <div className="mt-2 font-mono text-[13px] leading-tight text-body">
            {formatTimestamp(meta.generatedAt)}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[10px] text-faint">
            <span>{meta.generator}</span>
            <CopyButton value="npm run scorecard" compact />
          </div>
        </Panel>
      </div>

      <Callout tone={summary.fail > 0 ? "danger" : "warn"} title="The scorecard is a test result, not a marketing number.">
        <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-signal">PASS</span> means
        a check actually ran in this workspace.{" "}
        <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-danger">FAIL</span> would
        block. <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-signal">TEST_REQUIRED</span>{" "}
        means the property cannot be honestly tested without Person A&apos;s Solidity contracts, a real
        Hardhat run, or a fork simulation. Those rows are never rendered green.
      </Callout>

      <section id="checks">
        <SectionHeader
          eyebrow="Checks"
          title={`${entries.length} properties`}
          description="Hash sensitivity, evidence proofs, decoder coverage, 11 attack scenarios, graph math, voting math, claim review, and the deterministic report."
          right={
            <div className="flex flex-wrap items-center gap-1.5">
              {(["ALL", "PASS", "FAIL", "TEST_REQUIRED"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  className={cn(
                    "rounded border px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.08em] transition-colors",
                    filter === value
                      ? "border-signal/50 bg-signal/8 text-signal"
                      : "border-edge text-dim hover:border-edge2 hover:text-body",
                  )}
                >
                  {value === "TEST_REQUIRED" ? "test required" : value.toLowerCase()}
                  <span className="ml-1.5 text-faint">
                    {value === "ALL" ? entries.length : value === "PASS" ? summary.pass : value === "FAIL" ? summary.fail : summary.testRequired}
                  </span>
                </button>
              ))}
            </div>
          }
        />
        <Panel className="overflow-hidden">
          <div className="hidden grid-cols-[54px_minmax(0,1fr)_112px_86px_150px_54px] gap-3 border-b border-edge px-4 py-2 md:grid">
            {["ID", "Property", "Status", "Evidence", "Test file", "ms"].map((header) => (
              <span key={header} className="mono-label">
                {header}
              </span>
            ))}
          </div>
          <div className="divide-y divide-edge/70">
            {filtered.map((entry) => (
              <div
                key={entry.id}
                className={cn(
                  "grid gap-2 px-4 py-2.5 md:grid-cols-[54px_minmax(0,1fr)_112px_86px_150px_54px] md:items-center md:gap-3",
                  entry.status === "TEST_REQUIRED" && "bg-signal/[0.025]",
                  entry.status === "FAIL" && "bg-danger/5",
                )}
              >
                <div className="flex items-center justify-between gap-2 md:block">
                  <span className="font-mono text-[9.5px] text-faint">{entry.id}</span>
                  <span className="md:hidden">
                    <StatusPill status={entry.status}>{entry.status.replace("_", " ")}</StatusPill>
                  </span>
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-[11.5px] leading-snug text-body">{entry.property}</span>
                    <span className="chip">{groupFor(entry.id)}</span>
                  </div>
                  {entry.reason ? (
                    <div className="mt-1 text-[10px] leading-relaxed text-faint">{entry.reason}</div>
                  ) : null}
                  <div className="mt-1 flex items-center gap-2 md:hidden">
                    <EvidenceKind kind={entry.evidenceKind} />
                    <span className="font-mono text-[8.5px] text-faint">{entry.testFile}</span>
                  </div>
                </div>
                <div className="hidden md:block">
                  <StatusPill status={entry.status}>{entry.status.replace("_", " ")}</StatusPill>
                </div>
                <div className="hidden md:block">
                  <EvidenceKind kind={entry.evidenceKind} />
                </div>
                <div className="hidden min-w-0 md:block">
                  <span className="block truncate font-mono text-[8.5px] text-faint" title={entry.testFile}>
                    {entry.testFile}
                  </span>
                </div>
                <div className="hidden text-right font-mono text-[9px] text-faint md:block">
                  {entry.durationMs > 0 ? entry.durationMs : "—"}
                </div>
              </div>
            ))}
            {filtered.length === 0 ? (
              <div className="px-4 py-10 text-center text-[11px] text-faint">No checks in this filter.</div>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-edge px-4 py-2.5">
            <span className="chip">reference-model</span>
            <span className="chip">unit</span>
            <span className="chip border-signal/30 text-signal">pending-solidity</span>
            <span className="ml-auto text-[9.5px] text-faint">
              Generated from a real in-process run; mirrored by the Vitest suite.
            </span>
          </div>
        </Panel>
      </section>

      <section id="gaps" className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <Panel className="p-4">
          <div className="flex items-center gap-2">
            <ShieldAlert size={14} className="text-signal" />
            <span className="mono-label">What remains TEST_REQUIRED</span>
          </div>
          <div className="mt-3 space-y-2">
            {pending.map((entry) => (
              <div key={entry.id} className="rounded border border-signal/20 bg-signal/4 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[9px] text-signal">{entry.id}</span>
                  <span className="text-[11.5px] text-body">{entry.property}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[8.5px] uppercase tracking-[0.05em] text-faint">
                  <span>{entry.testFile}</span>
                  <span>·</span>
                  <span>{entry.reason}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[10px] leading-relaxed text-faint">
            The swap points and acceptance criteria are in{" "}
            <code className="text-steel">docs/person-a-handoff.md</code>. Do not change schemas, error
            names or hash fields without announcing it to the other side.
          </p>
        </Panel>

        <div className="space-y-3">
          <Panel className="p-4">
            <div className="mono-label mb-2">How to regenerate</div>
            <div className="flex items-center justify-between gap-2 rounded border border-edge bg-ink/50 px-3 py-2">
              <code className="font-mono text-[11px] text-steel">npm run scorecard</code>
              <CopyButton value="npm run scorecard" compact />
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-faint">
              The script runs the reference executor, hash sensitivity checks, decoder, evidence
              proofs, graph math, voting math, claim review and report determinism, then writes{" "}
              <code className="text-steel">packages/shared/fixtures/scorecard.json</code>.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Link href="/arena" className="btn btn-sm">
                Open the arena
              </Link>
              <Link href="/timeline" className="btn btn-sm">
                Verify evidence
              </Link>
            </div>
          </Panel>

          <Panel className="p-4">
            <button
              type="button"
              onClick={() => setRawOpen((open) => !open)}
              className="flex w-full items-center justify-between gap-2 text-left"
            >
              <span className="flex items-center gap-2">
                <FileJson size={13} className="text-info" />
                <span className="mono-label text-body">Raw scorecard JSON</span>
              </span>
              <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-faint">
                {rawOpen ? "hide" : "show"}
              </span>
            </button>
            {rawOpen ? (
              <>
                <div className="mt-2 flex justify-end">
                  <CopyButton value={JSON.stringify(entries, null, 2)} label="Scorecard JSON" />
                </div>
                <pre className="mt-2 max-h-64 overflow-auto rounded border border-edge bg-ink/50 p-3 font-mono text-[9px] leading-relaxed text-steel">
                  {JSON.stringify(entries, null, 2)}
                </pre>
              </>
            ) : (
              <p className="mt-2 text-[10px] leading-relaxed text-faint">
                schema (d) · {entries.length} entries · generated {formatTimestamp(meta.generatedAt)}
              </p>
            )}
          </Panel>

          <div className="flex items-center gap-2 rounded-lg border border-edge bg-white/2 px-3 py-2">
            <Terminal size={12} className="text-faint" />
            <span className="text-[10px] leading-snug text-faint">
              Vitest covers the same pure functions; run{" "}
              <code className="text-steel">npm test</code>. A green row without a test would be a
              lie, so there are none.
            </span>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3 border-t border-edge pt-4 text-[10px] text-faint">
        <span>
          Scorecard digest: <code className="text-steel">{shortHex(digest, 8)}</code>
        </span>
        <span className="ml-auto inline-flex items-center gap-1 font-mono uppercase tracking-[0.08em]">
          <ArrowUpRight size={11} /> {meta.mode}
        </span>
      </div>
    </div>
  );
}
