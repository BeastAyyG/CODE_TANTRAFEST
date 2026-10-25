"use client";

import { Fragment } from "react";
import { Activity } from "lucide-react";
import { DataState } from "@/components/ui/DataState";
import { getEvaluationChain } from "@/lib/data";
import { cn } from "@/lib/format";
import { useAsync } from "@/lib/useAsync";
import type { Stage, StageStatus } from "@/lib/types";
import { StageCard } from "./StageCard";

const DOT: Record<StageStatus, string> = {
  GREEN: "bg-[#22ff88]",
  AMBER: "bg-amber-400",
  RED: "bg-red-500",
};

function Connector({ status }: { status: StageStatus }) {
  return (
    <div className="hidden w-8 items-center lg:flex" aria-hidden>
      <div className="relative h-px w-full bg-gradient-to-r from-slate-700 to-slate-800">
        <span
          className={cn(
            "animate-flow absolute -top-[3px] h-1.5 w-1.5 rounded-full",
            DOT[status]
          )}
        />
      </div>
    </div>
  );
}

export function DecisionTrail({ proposalId }: { proposalId: string }) {
  const { data, loading, error, reload } = useAsync(
    () => getEvaluationChain(proposalId),
    [proposalId]
  );
  const stages: Stage[] = data?.stages ?? [];

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Activity size={14} className="text-cyan-300" />
          Execution is a binary gate. Percentages before it are advisory.
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">
          {proposalId}
        </span>
      </div>

      <DataState
        loading={loading}
        error={error}
        empty={!loading && !error && stages.length === 0}
        emptyMessage="No evaluation chain for this proposal."
        loadingLabel="Evaluating pipeline"
        onRetry={reload}
      >
        <div className="grid gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] lg:items-stretch">
          {stages.map((stage, index) => (
            <Fragment key={stage.stage}>
              <StageCard
                stage={stage}
                dominated={
                  stage.stage === "EXECUTION" && stage.status === "RED"
                }
              />
              {index < stages.length - 1 ? (
                <Connector status={stage.status} />
              ) : null}
            </Fragment>
          ))}
        </div>
        {stages.some((stage) => stage.stage === "EXECUTION" && stage.status === "RED") ? (
          <p className="mt-3 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-red-400/80">
            <span className="status-dot text-red-500" />
            Hard gate tripped — advisory stages cannot override execution.
          </p>
        ) : null}
      </DataState>
    </section>
  );
}
