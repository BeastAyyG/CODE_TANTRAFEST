"use client";

import { History } from "lucide-react";
import { DataState } from "@/components/ui/DataState";
import { HashChip } from "@/components/ui/HashChip";
import { Panel } from "@/components/ui/Panel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { getVersionChain } from "@/lib/data";
import { formatDateTime } from "@/lib/format";
import { useAsync } from "@/lib/useAsync";

export function VersionChainView({ proposalId }: { proposalId: string }) {
  const { data, loading, error, reload } = useAsync(
    () => getVersionChain(proposalId),
    [proposalId]
  );

  return (
    <Panel
      title="Version Chain"
      subtitle="Append-only versions. Any amendment requires a new vote."
      actions={
        data ? (
          <div className="flex items-center gap-2">
            <StatusBadge tone={data.valid ? "success" : "danger"}>
              {data.valid ? "CHAIN VALID" : "CHAIN BROKEN"}
            </StatusBadge>
            <StatusBadge tone="info">
              {data.versions.length} version
              {data.versions.length === 1 ? "" : "s"}
            </StatusBadge>
          </div>
        ) : null
      }
    >
      <DataState
        loading={loading}
        error={error}
        empty={!loading && !error && !data}
        emptyMessage="No version chain for this proposal."
        loadingLabel="Loading version chain"
        onRetry={reload}
      >
        {data ? (
          <ol className="relative space-y-4 border-l border-slate-800 pl-6">
            {data.versions.map((version) => (
              <li key={version.versionHash} className="relative">
                <span className="absolute -left-[31px] top-1.5 grid h-4 w-4 place-items-center rounded-full border border-slate-700 bg-slate-950">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_8px_#22d3ee]" />
                </span>
                <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone="info">v{version.version}</StatusBadge>
                      <span className="text-sm text-slate-200">
                        {version.contentPreview}
                      </span>
                    </div>
                    <span className="font-mono text-[10px] text-slate-500">
                      {formatDateTime(version.timestamp)}
                    </span>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <HashChip label="version" value={version.versionHash} />
                    {isZeroHash(version.prevVersionHash) ? (
                      <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-800 bg-slate-950/70 px-2 py-1 font-mono text-[11px] text-slate-500">
                        <History size={11} /> genesis
                      </span>
                    ) : (
                      <HashChip label="prev" value={version.prevVersionHash} />
                    )}
                    <HashChip label="content" value={version.contentHash} />
                    <HashChip label="intent" value={version.intentHash} />
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                    <span>author</span>
                    <HashChip value={version.author} lead={8} tail={4} />
                    <span className="text-slate-600">·</span>
                    <span>disclosure</span>
                    <HashChip value={version.disclosureHash} lead={8} tail={4} />
                  </div>
                </div>
              </li>
            ))}
          </ol>
        ) : null}
      </DataState>
    </Panel>
  );
}

function isZeroHash(value: string): boolean {
  return /^0x0+$/.test(value);
}
