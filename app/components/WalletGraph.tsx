"use client";

import { Network, ShieldAlert } from "lucide-react";
import { DataState } from "@/components/ui/DataState";
import { HashChip } from "@/components/ui/HashChip";
import { Panel } from "@/components/ui/Panel";
import { Stat } from "@/components/ui/Stat";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { getGraph } from "@/lib/data";
import { formatDateTime, formatNumber } from "@/lib/format";
import { useAsync } from "@/lib/useAsync";

export function WalletGraph({ proposalId }: { proposalId: string }) {
  const { data, loading, error, reload } = useAsync(
    () => getGraph(proposalId),
    [proposalId]
  );

  return (
    <Panel
      title="Wallet Graph"
      subtitle="Simulated wallet links. The interactive canvas lands in the next build."
      actions={<StatusBadge status="SIMULATED">SIMULATED DATA</StatusBadge>}
    >
      <DataState
        loading={loading}
        error={error}
        empty={!loading && !error && !data}
        emptyMessage="No graph for this proposal."
        loadingLabel="Loading simulated graph"
        onRetry={reload}
      >
        {data ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Nodes" value={formatNumber(data.nodes.length)} />
              <Stat label="Edges" value={formatNumber(data.edges.length)} />
              <Stat
                label="Disclosed wallets"
                value={formatNumber(data.disclosure.disclosedWallets.length)}
                tone="info"
              />
              <Stat
                label="Snapshot"
                value={formatDateTime(data.snapshotAt)}
                mono={false}
              />
            </div>

            <div className="relative overflow-hidden rounded-xl border border-dashed border-slate-800 bg-slate-950/50 px-6 py-14 text-center">
              <div
                className="pointer-events-none absolute inset-0 opacity-50"
                style={{
                  backgroundImage:
                    "radial-gradient(circle at 20% 30%, rgba(34,211,238,0.12), transparent 40%), radial-gradient(circle at 80% 70%, rgba(34,255,136,0.08), transparent 45%)",
                }}
              />
              <div className="relative mx-auto flex max-w-md flex-col items-center gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-2xl border border-cyan-900/70 bg-cyan-950/30 text-cyan-300">
                  <Network size={22} />
                </span>
                <h3 className="text-sm font-semibold text-slate-100">
                  Interactive wallet graph
                </h3>
                <p className="text-xs leading-relaxed text-slate-400">
                  The force-directed canvas will render {data.nodes.length}{" "}
                  simulated wallets and {data.edges.length} transactions here.
                  This container is intentionally a placeholder.
                </p>
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-amber-300">
                  <ShieldAlert size={12} />
                  Simulated data — not chain evidence
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>Disclosure payload</span>
              <HashChip
                label="wallet list"
                value={data.disclosure.walletListHash}
              />
            </div>
          </div>
        ) : null}
      </DataState>
    </Panel>
  );
}
