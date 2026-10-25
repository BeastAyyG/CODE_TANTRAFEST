"use client";

import { AlertTriangle, FileText } from "lucide-react";
import { DataState } from "@/components/ui/DataState";
import { HashChip } from "@/components/ui/HashChip";
import { Panel } from "@/components/ui/Panel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { getIntentDraft } from "@/lib/data";
import { cn, formatPct } from "@/lib/format";
import { useAsync } from "@/lib/useAsync";
import type { UnresolvedItem } from "@/lib/types";

const SOURCE_PLACEHOLDER: Record<string, never> = {};

export function IntentDraftView({ proposalId }: { proposalId: string }) {
  const { data, loading, error, reload } = useAsync(
    () => getIntentDraft(proposalId),
    [proposalId]
  );

  return (
    <Panel
      title="Intent Draft"
      subtitle="Source-grounded extraction. UNRESOLVED items must be resolved before hashing."
      actions={
        data ? (
          <div className="flex items-center gap-2">
            <StatusBadge tone="info">
              {data.actions.length} action{data.actions.length === 1 ? "" : "s"}
            </StatusBadge>
            {data.unresolved.length > 0 ? (
              <StatusBadge tone="warning">
                {data.unresolved.length} unresolved
              </StatusBadge>
            ) : null}
          </div>
        ) : null
      }
    >
      <DataState
        loading={loading}
        error={error}
        empty={!loading && !error && !data}
        emptyMessage="No intent draft for this proposal."
        loadingLabel="Loading intent draft"
        onRetry={reload}
      >
        {data ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <FileText size={16} className="text-cyan-300" />
                <h3 className="text-sm font-semibold text-slate-100">
                  {data.title}
                </h3>
                <StatusBadge tone="neutral">v{data.version}</StatusBadge>
                <StatusBadge tone="neutral">{data.proposalId}</StatusBadge>
              </div>
              <HashChip label="doc" value={data.actions[0]?.source.docHash ?? null} />
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="bg-slate-900/70 text-[10px] uppercase tracking-[0.12em] text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Kind</th>
                    <th className="px-4 py-2.5 font-semibold">Target</th>
                    <th className="px-4 py-2.5 font-semibold">Counterparty</th>
                    <th className="px-4 py-2.5 font-semibold">Selector</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Max amount</th>
                    <th className="px-4 py-2.5 font-semibold">Confidence</th>
                    <th className="px-4 py-2.5 font-semibold">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {data.actions.map((action, index) => (
                    <tr
                      key={`${action.kind}-${index}`}
                      className="border-t border-slate-800/80 transition-colors duration-150 hover:bg-slate-900/40"
                    >
                      <td className="px-4 py-2.5">
                        <StatusBadge tone="info">{action.kind}</StatusBadge>
                      </td>
                      <td className="px-4 py-2.5">
                        <HashChip value={action.target || null} lead={8} tail={4} />
                      </td>
                      <td className="px-4 py-2.5">
                        <HashChip value={action.counterparty || null} lead={8} tail={4} />
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[11px] text-slate-400">
                        {action.selector || "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-[11px] tabular-nums text-slate-300">
                        {action.maxAmount}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="w-9 font-mono text-[11px] tabular-nums text-slate-400">
                            {formatPct(action.confidence)}
                          </span>
                          <span className="h-1 w-12 overflow-hidden rounded-full bg-slate-800">
                            <span
                              className={cn(
                                "block h-full rounded-full",
                                action.confidence >= 0.8
                                  ? "bg-[#22ff88]"
                                  : action.confidence >= 0.6
                                    ? "bg-amber-400"
                                    : "bg-red-500"
                              )}
                              style={{ width: `${Math.round(action.confidence * 100)}%` }}
                            />
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[10px] text-slate-500">
                        §{action.source.section} · [{action.source.span[0]},{" "}
                        {action.source.span[1]}]
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {data.unresolved.length > 0 ? (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-300/80">
                  Unresolved — needs a human decision
                </p>
                {data.unresolved.map((item, index) => (
                  <UnresolvedCard key={`${item.question}-${index}`} item={item} />
                ))}
              </div>
            ) : null}

            {data.assumptions.length > 0 ? (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Assumptions
                </p>
                <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                  {data.assumptions.map((item) => (
                    <li
                      key={item.name}
                      className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs"
                    >
                      <span className="font-mono text-[10px] text-cyan-300">
                        {item.name}
                      </span>
                      <p className="mt-0.5 text-slate-400">{item.value}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </DataState>
    </Panel>
  );
}

function UnresolvedCard({ item }: { item: UnresolvedItem }) {
  const source = item.source ?? SOURCE_PLACEHOLDER;
  const span = "span" in source && Array.isArray(source.span) ? source.span : null;
  return (
    <div className="rounded-lg border border-amber-900/60 bg-amber-950/20 px-3 py-2">
      <div className="flex items-start gap-2">
        <AlertTriangle size={14} className="mt-0.5 text-amber-400" />
        <div className="min-w-0">
          <p className="text-xs leading-relaxed text-amber-200">
            {item.question}
          </p>
          {span ? (
            <p className="mt-1 font-mono text-[10px] text-amber-500/80">
              §{("section" in source ? source.section : "1")} · [{span[0]},{" "}
              {span[1]}]
            </p>
          ) : (
            <p className="mt-1 text-[10px] text-amber-500/60">No source span</p>
          )}
        </div>
      </div>
    </div>
  );
}
