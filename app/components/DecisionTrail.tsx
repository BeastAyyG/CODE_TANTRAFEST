"use client";

import { Fragment } from "react";
import { Activity, ShieldAlert } from "lucide-react";
import { DataState } from "@/components/ui/DataState";
import { getEvaluationChain } from "@/lib/data";
import { cn } from "@/lib/format";
import { useAsync } from "@/lib/useAsync";
import type { SentinelEvent, Stage, StageStatus } from "@/lib/types";
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

export function DecisionTrail({
  proposalId,
  liveEvent,
}: {
  proposalId: string;
  liveEvent?: SentinelEvent | null;
}) {
  const { data, loading, error, reload } = useAsync(
    () => getEvaluationChain(proposalId),
    [proposalId]
  );
  const liveGate =
    liveEvent &&
    liveEvent.proposalId === proposalId &&
    (liveEvent.phase === "HALTED" || liveEvent.phase === "VIOLATION")
      ? liveEvent
      : null;
  const gateStatus: StageStatus = liveGate?.phase === "HALTED" ? "RED" : "AMBER";

  const baseStages: Stage[] = data?.stages ?? [];
  const stages = baseStages.map((stage) =>
    liveGate && stage.stage === "EXECUTION"
      ? {
          ...stage,
          status: gateStatus,
          reason: liveGateReason(liveGate),
          factors: [
            {
              label: "Live Sentinel phase",
              value: liveGate.phase,
              detail: "Observed by sentinel/watcher.ts from ProposalQueued.",
            },
            {
              label: "commitment",
              value: liveGate.commitment,
              detail: liveGate.report?.violatedConstraint.message ?? liveGate.detail,
            },
            ...(liveGate.reportHash
              ? [{ label: "reportHash", value: liveGate.reportHash }]
              : []),
            ...(liveGate.haltTxHash
              ? [{ label: "haltTx", value: liveGate.haltTxHash }]
              : []),
            ...stage.factors,
          ],
        }
      : stage
  );
  const gateOnly = liveGate && stages.length === 0;
  const displayStages = gateOnly ? [liveGateStage(liveGate)] : stages;
  const showError = gateOnly ? null : error;

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

      {gateOnly ? (
        <div className="mb-2 flex items-start gap-2 rounded-lg border border-amber-900/50 bg-amber-950/15 px-3 py-2 text-[11px] leading-relaxed text-amber-200/80">
          <ShieldAlert size={14} className="mt-0.5 shrink-0 text-amber-300" />
          The advisory evaluation chain could not be loaded for this newly observed
          proposal. The live Sentinel gate below comes directly from chain evidence.
        </div>
      ) : null}

      <DataState
        loading={loading}
        error={showError}
        empty={!loading && !error && displayStages.length === 0}
        emptyMessage="No evaluation chain for this proposal."
        loadingLabel="Evaluating pipeline"
        onRetry={reload}
      >
        <div
          className={cn(
            "grid gap-3 lg:items-stretch",
            displayStages.length > 1
              ? "lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr]"
              : "max-w-xl"
          )}
        >
          {displayStages.map((stage, index) => (
            <Fragment key={stage.stage}>
              <StageCard
                stage={stage}
                dominated={stage.stage === "EXECUTION" && stage.status === "RED"}
              />
              {index < displayStages.length - 1 ? (
                <Connector status={stage.status} />
              ) : null}
            </Fragment>
          ))}
        </div>
        {displayStages.some(
          (stage) => stage.stage === "EXECUTION" && stage.status === "RED"
        ) ? (
          <p className="mt-3 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-red-400/80">
            <span className="status-dot text-red-500" />
            Hard gate tripped — advisory stages cannot override execution.
          </p>
        ) : null}
      </DataState>
    </section>
  );
}

function liveGateReason(event: SentinelEvent): string {
  const detail = event.report?.violatedConstraint.message ?? event.detail;
  if (event.phase === "HALTED") {
    return `Live Sentinel halt: ${detail} The executor is now Halted; forced execution must revert.`;
  }
  return `Live Sentinel violation detected: ${detail} Guardian halt is being processed.`;
}

function liveGateStage(event: SentinelEvent): Stage {
  return {
    stage: "EXECUTION",
    score: null,
    status: "RED",
    reason: liveGateReason(event),
    factors: [
      {
        label: "Live proposal",
        value: event.proposalId,
        detail: event.title,
      },
      {
        label: "commitment",
        value: event.commitment,
        detail: event.report?.violatedConstraint.message ?? event.detail,
      },
      ...(event.reportHash
        ? [{ label: "reportHash", value: event.reportHash }]
        : []),
      ...(event.haltTxHash ? [{ label: "haltTx", value: event.haltTxHash }] : []),
    ],
    drilldown: "live-sentinel",
  };
}
