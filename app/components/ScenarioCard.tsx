"use client";

import { FileSearch, Loader2, Play } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cn, formatDuration } from "@/lib/format";
import type { ArenaRunResult, ScenarioReport } from "@/lib/types";

export interface RunState {
  state: "running" | "done" | "error";
  result?: ArenaRunResult;
  error?: string;
}

export function ScenarioCard({
  report,
  run,
  selected,
  onRun,
  onSelect,
}: {
  report: ScenarioReport;
  run?: RunState;
  selected: boolean;
  onRun: (id: number) => void;
  onSelect: (id: number) => void;
}) {
  const running = run?.state === "running";

  return (
    <article
      className={cn(
        "flex flex-col rounded-2xl border bg-slate-900/60 p-4 transition-all duration-150",
        selected
          ? "border-cyan-900/70 shadow-[0_0_35px_-18px_rgba(34,211,238,0.7)]"
          : "border-slate-800 hover:border-slate-700"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs text-slate-500">
          S{report.scenarioId}
        </span>
        <StatusBadge status={report.outcome} />
      </div>

      <h3 className="mt-2 text-sm font-semibold text-slate-100">
        {report.scenarioName}
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-400">
        {report.property}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-slate-500">
        <span>expected</span>
        <span className="text-slate-300">{report.outcome}</span>
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 pt-4">
        <button
          type="button"
          onClick={() => onRun(report.scenarioId)}
          disabled={running}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors duration-150",
            running
              ? "border-slate-800 text-slate-500"
              : "border-emerald-900/70 bg-emerald-950/30 text-[#22ff88] hover:bg-emerald-950/50"
          )}
        >
          {running ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Play size={13} />
          )}
          {running ? "Running…" : "Run attack"}
        </button>
        <button
          type="button"
          onClick={() => onSelect(report.scenarioId)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 px-2.5 py-1.5 text-xs text-slate-300 transition-colors duration-150 hover:border-cyan-900/70 hover:text-cyan-200"
        >
          <FileSearch size={13} />
          Report
        </button>
      </div>

      {run ? (
        <div className="mt-3 border-t border-slate-800 pt-2 text-[11px]">
          {run.state === "done" && run.result ? (
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={run.result.status} pulse />
              <span className="font-mono tabular-nums text-slate-400">
                {formatDuration(run.result.durationMs)}
              </span>
              <span className="text-slate-500">scorecard updated</span>
            </div>
          ) : run.state === "error" ? (
            <p className="break-all font-mono text-[10px] text-red-400">
              {run.error}
            </p>
          ) : (
            <p className="text-slate-500">Executing scenario…</p>
          )}
        </div>
      ) : null}
    </article>
  );
}
