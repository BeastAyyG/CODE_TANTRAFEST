"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Info, Lock, X } from "lucide-react";
import type { StageScore } from "@/packages/shared/schemas";
import { ScoreRing, StatusPill, cn, statusTextClass } from "./ui";

const STAGE_META: Record<
  StageScore["stage"],
  { index: string; name: string; scoreLabel: string; drilldownLabel: string }
> = {
  CLAIMS: { index: "01", name: "Claims", scoreLabel: "confidence", drilldownLabel: "Open claims review" },
  COI: { index: "02", name: "Conflict of interest", scoreLabel: "risk", drilldownLabel: "Open wallet graph" },
  VOTING: { index: "03", name: "Voting", scoreLabel: "legitimacy", drilldownLabel: "Open informed vote" },
  EXECUTION: { index: "04", name: "Execution", scoreLabel: "gate", drilldownLabel: "Open violation report" },
};

export function StagePipeline({ stages }: { stages: StageScore[] }) {
  const [selected, setSelected] = useState<StageScore | null>(null);

  useEffect(() => {
    if (!selected) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [selected]);

  return (
    <>
      <div className="relative">
        <div className="pointer-events-none absolute left-[10%] right-[10%] top-[46px] hidden h-px bg-edge xl:block" />
        <div className="relative grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {stages.map((stage) => {
            const meta = STAGE_META[stage.stage];
            const hardGate = stage.stage === "EXECUTION";
            const tone =
              stage.status === "RED"
                ? "bg-danger"
                : stage.status === "AMBER"
                  ? "bg-signal"
                  : "bg-safe";
            return (
              <button
                key={stage.stage}
                type="button"
                onClick={() => setSelected(stage)}
                className={cn(
                  "panel group relative overflow-hidden p-4 text-left transition-colors hover:border-edge2",
                  hardGate && "border-danger/25",
                )}
              >
                <span className={cn("absolute inset-x-0 top-0 h-[2px]", tone)} />
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="mono-label mb-1">
                      {meta.index} · {hardGate ? "hard gate" : "stage"}
                    </div>
                    <div className="text-[14px] font-medium text-body">{meta.name}</div>
                  </div>
                  <StatusPill status={stage.status}>{stage.status}</StatusPill>
                </div>

                <div className="mt-4 flex items-center gap-4">
                  <ScoreRing
                    score={stage.score}
                    status={stage.status}
                    size={62}
                    label={meta.scoreLabel}
                    hardGate={hardGate}
                  />
                  <div className="min-w-0">
                    <div className={cn("font-mono text-[10px] uppercase tracking-[0.1em]", statusTextClass(stage.status))}>
                      {hardGate ? "binary verdict" : stage.status === "RED" ? "attention" : stage.status === "AMBER" ? "review" : "clear"}
                    </div>
                    <p className="mt-1.5 line-clamp-3 text-[11.5px] leading-snug text-dim">{stage.reason}</p>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-edge/70 pt-2.5">
                  <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-faint">
                    {stage.factors.length} factors
                  </span>
                  <span className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.1em] text-dim group-hover:text-signal">
                    why
                    <ArrowUpRight size={11} strokeWidth={1.8} />
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <p className="mt-3 flex items-start gap-2 text-[10.5px] leading-relaxed text-faint">
        <Info size={12} className="mt-0.5 shrink-0" />
        Higher is better for Claims and Voting. COI is a risk score: higher is worse. Execution is not
        averaged — it is a deterministic gate.
      </p>

      {selected ? (
        <div
          className="fixed inset-0 z-[90] flex justify-end bg-black/65 backdrop-blur-sm"
          onClick={() => setSelected(null)}
          role="presentation"
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-label={`${STAGE_META[selected.stage].name} drilldown`}
            onClick={(event) => event.stopPropagation()}
            className="h-full w-full max-w-md overflow-y-auto border-l border-edge bg-panel p-5 shadow-2xl fade-up"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="mono-label mb-1">
                  {STAGE_META[selected.stage].index} · stage drilldown
                </div>
                <h2 className="text-[20px] font-medium tracking-[-0.01em] text-body">
                  {STAGE_META[selected.stage].name}
                </h2>
                <div className="mt-2 flex items-center gap-2">
                  <StatusPill status={selected.status}>{selected.status}</StatusPill>
                  {selected.stage === "EXECUTION" ? (
                    <span className="chip border-danger/30 text-danger">
                      <Lock size={10} /> hard gate
                    </span>
                  ) : (
                    <span className="font-mono text-[11px] text-steel">
                      {selected.score === null ? "—" : selected.score.toFixed(3)}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Close drilldown"
                className="rounded border border-edge p-1.5 text-dim hover:border-edge2 hover:text-body"
              >
                <X size={14} />
              </button>
            </div>

            <p className="mt-4 border-l border-edge2 pl-3 text-[12.5px] leading-relaxed text-dim">
              {selected.reason}
            </p>

            <div className="mt-5">
              <div className="mono-label mb-2">Factors</div>
              <div className="divide-y divide-edge/70">
                {selected.factors.map((factor, index) => (
                  <div key={`${factor.label}-${index}`} className="py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[12px] font-medium text-body">{factor.label}</span>
                      <span className="shrink-0 font-mono text-[11px] text-steel">{factor.value}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[10.5px] text-faint">
                      {factor.weight ? <span className="chip">{factor.weight}</span> : null}
                      {factor.detail ? <span className="leading-snug">{factor.detail}</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {selected.stage === "EXECUTION" ? (
              <div className="mt-5 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2.5 text-[11px] leading-relaxed text-dim">
                A failing execution gate cannot be offset by a good score elsewhere. The transaction
                is rejected by deterministic code, not by an average.
              </div>
            ) : null}

            <Link
              href={selected.drilldown}
              className="btn btn-primary mt-6 w-full"
              onClick={() => setSelected(null)}
            >
              {STAGE_META[selected.stage].drilldownLabel}
              <ArrowUpRight size={13} />
            </Link>
          </aside>
        </div>
      ) : null}
    </>
  );
}
