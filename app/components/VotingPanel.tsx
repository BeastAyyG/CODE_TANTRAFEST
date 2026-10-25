"use client";

import { Check, X } from "lucide-react";
import { DataState } from "@/components/ui/DataState";
import { HashChip } from "@/components/ui/HashChip";
import { Panel } from "@/components/ui/Panel";
import { Stat } from "@/components/ui/Stat";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { getVotingState } from "@/lib/data";
import { formatDateTime, formatPct, formatTokenUnits } from "@/lib/format";
import { useAsync } from "@/lib/useAsync";
import type { VoteRecord, VotingState } from "@/lib/types";

const SUPPORT: Record<number, { label: string; tone: StatusTone }> = {
  0: { label: "Against", tone: "danger" },
  1: { label: "For", tone: "success" },
  2: { label: "Abstain", tone: "neutral" },
};

const STATE_TONE: Record<string, StatusTone> = {
  VotingOpen: "warning",
  Passed: "success",
  Queued: "info",
  Executed: "success",
  Defeated: "danger",
  Halted: "danger",
  Cancelled: "neutral",
};

export function VotingPanel({ govId }: { govId: string }) {
  const { data, loading, error, reload } = useAsync(
    () => getVotingState(govId),
    [govId]
  );

  return (
    <Panel
      title="Voting State"
      subtitle="Voting binds to the commitment; brief acknowledgments feed the informed-vote ratio."
      actions={
        data ? (
          <div className="flex items-center gap-2">
            <StatusBadge tone={STATE_TONE[data.state] ?? "neutral"}>
              {data.state}
            </StatusBadge>
            <StatusBadge tone="neutral">gov {data.govId}</StatusBadge>
          </div>
        ) : null
      }
    >
      <DataState
        loading={loading}
        error={error}
        empty={!loading && !error && !data}
        emptyMessage="No voting state for this proposal."
        loadingLabel="Loading voting state"
        onRetry={reload}
      >
        {data ? <VotingBody state={data} /> : null}
      </DataState>
    </Panel>
  );
}

function VotingBody({ state }: { state: VotingState }) {
  const total = BigInt(state.forVotes) + BigInt(state.againstVotes) + BigInt(state.abstainVotes);
  const share = (value: string) =>
    total === 0n ? 0 : Number((BigInt(value) * 10000n) / total) / 100;

  const forShare = share(state.forVotes);
  const againstShare = share(state.againstVotes);
  const abstainShare = Math.max(0, 100 - forShare - againstShare);
  const quorumProgress =
    BigInt(state.quorum) === 0n
      ? 0
      : Math.min(100, Number((total * 10000n) / BigInt(state.quorum)) / 100);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Stat label="For" value={formatTokenUnits(state.forVotes)} tone="success" />
        <Stat label="Against" value={formatTokenUnits(state.againstVotes)} tone="danger" />
        <Stat label="Abstain" value={formatTokenUnits(state.abstainVotes)} />
        <Stat
          label="Quorum"
          value={formatTokenUnits(state.quorum)}
          tone={state.quorumReached ? "success" : "warning"}
          hint={state.quorumReached ? "reached" : "not reached"}
        />
        <Stat label="Informed ratio" value={formatPct(state.informedRatio)} tone="info" />
        <Stat label="Brief acks" value={state.totalBriefAcks} tone="info" />
      </div>

      <div>
        <div className="flex h-3 overflow-hidden rounded-full bg-slate-800">
          <span
            className="h-full bg-[#22ff88] shadow-[0_0_12px_rgba(34,255,136,0.45)]"
            style={{ width: `${forShare}%` }}
          />
          <span className="h-full bg-red-500" style={{ width: `${againstShare}%` }} />
          <span className="h-full bg-slate-600" style={{ width: `${abstainShare}%` }} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-4 text-[10px] uppercase tracking-[0.12em] text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="status-dot text-[#22ff88]" /> for {forShare.toFixed(1)}%
          </span>
          <span className="flex items-center gap-1.5">
            <span className="status-dot text-red-500" /> against {againstShare.toFixed(1)}%
          </span>
          <span className="flex items-center gap-1.5">
            <span className="status-dot text-slate-500" /> abstain {abstainShare.toFixed(1)}%
          </span>
          <span className="ml-auto normal-case tracking-normal text-slate-500">
            {formatTokenUnits(total.toString())} votes cast
          </span>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.12em] text-slate-500">
          <span>Quorum progress</span>
          <span className="font-mono tabular-nums text-slate-400">
            {quorumProgress.toFixed(1)}%
          </span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-800">
          <span
            className="block h-full rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.5)]"
            style={{ width: `${quorumProgress}%` }}
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full min-w-[620px] text-left text-sm">
          <thead className="bg-slate-900/70 text-[10px] uppercase tracking-[0.12em] text-slate-500">
            <tr>
              <th className="px-4 py-2.5 font-semibold">Voter</th>
              <th className="px-4 py-2.5 font-semibold">Support</th>
              <th className="px-4 py-2.5 text-right font-semibold">Weight</th>
              <th className="px-4 py-2.5 font-semibold">Brief acknowledged</th>
            </tr>
          </thead>
          <tbody>
            {state.votes.map((vote) => (
              <VoteRow key={vote.voter} vote={vote} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
          <span>commitment</span>
          <HashChip value={state.commitment} />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
          <span>actions</span>
          <HashChip value={state.actionsHash} />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
          <span>intent</span>
          <HashChip value={state.intentHash} />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
          <span>disclosure</span>
          <HashChip value={state.disclosureHash} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-[10px] text-slate-500">
        <span>voting opens {formatDateTime(state.voteStart)}</span>
        <span>closes {formatDateTime(state.voteEnd)}</span>
        <span>snapshot block {state.snapshotBlock.toLocaleString("en-US")}</span>
      </div>
    </div>
  );
}

function VoteRow({ vote }: { vote: VoteRecord }) {
  const support = SUPPORT[vote.support] ?? SUPPORT[2];
  return (
    <tr className="border-t border-slate-800/80 transition-colors duration-150 hover:bg-slate-900/40">
      <td className="px-4 py-2.5">
        <HashChip value={vote.voter} lead={8} tail={4} />
      </td>
      <td className="px-4 py-2.5">
        <StatusBadge tone={support.tone}>{support.label}</StatusBadge>
      </td>
      <td className="px-4 py-2.5 text-right font-mono text-[11px] tabular-nums text-slate-300">
        {formatTokenUnits(vote.weight)}
      </td>
      <td className="px-4 py-2.5">
        {vote.briefHash ? (
          <span className="inline-flex items-center gap-1 text-xs text-[#22ff88]">
            <Check size={13} /> acknowledged
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
            <X size={13} /> no brief
          </span>
        )}
      </td>
    </tr>
  );
}
