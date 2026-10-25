import Link from "next/link";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { formatUnits } from "ethers";
import { getChainDiagnostics, getProvider } from "@/lib/chain";
import { liveGetProposals, liveGetVotingState } from "@/lib/live";
import { repoRoot } from "@/lib/backend";
import type { Proposal, VotingState } from "@/lib/types";
import { LiveWatcher } from "@/components/LiveWatcher";
import { Panel, SectionHeader, StatusPill, type StatusLike } from "@/components/ui";

export const dynamic = "force-dynamic";

type SeedEntry = {
  title: string;
  govId: string | null;
  state: string;
  commitment: string | null;
  versionChain: string[];
  notes: string;
};

type LiveRow = {
  proposal: Proposal;
  seed: SeedEntry | null;
  chain: VotingState | null;
};

function readSeedIndex(): Record<string, SeedEntry> {
  try {
    const file = path.join(
      repoRoot(),
      "packages",
      "shared",
      "fixtures",
      "demo-state.json"
    );
    if (!existsSync(file)) return {};
    return JSON.parse(readFileSync(file, "utf8")) as Record<string, SeedEntry>;
  } catch {
    return {};
  }
}

function short(value: string | null | undefined, head = 6, tail = 4): string {
  if (!value) return "—";
  if (value.length <= head + tail + 2) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function votes(value: string | undefined): string {
  if (!value) return "—";
  try {
    return Number(formatUnits(BigInt(value), 18)).toLocaleString("en-US", {
      maximumFractionDigits: 0,
    });
  } catch {
    return value;
  }
}

function stateTone(state: string): StatusLike {
  switch (state) {
    case "Executed":
      return "OK";
    case "Halted":
    case "Defeated":
    case "Cancelled":
      return "RED";
    case "VotingOpen":
    case "Queued":
    case "DisclosurePending":
      return "AMBER";
    case "Challenged":
      return "FLAGGED";
    case "Passed":
      return "PASSED";
    default:
      return "NEUTRAL";
  }
}

export default async function LivePage() {
  const diagnostics = await getChainDiagnostics();
  const seed = readSeedIndex();

  let proposals: Proposal[] = [];
  let listError: string | null = null;
  try {
    proposals = await liveGetProposals();
  } catch (error) {
    listError = error instanceof Error ? error.message : String(error);
  }

  let blockNumber: number | null = null;
  try {
    blockNumber = await getProvider().getBlockNumber();
  } catch {
    blockNumber = null;
  }

  const rows: LiveRow[] = await Promise.all(
    proposals.map(async (proposal) => {
      let chain: VotingState | null = null;
      if (proposal.govId) {
        try {
          chain = await liveGetVotingState(proposal.govId);
        } catch {
          chain = null;
        }
      }
      return { proposal, seed: seed[proposal.id] ?? null, chain };
    })
  );

  const liveContracts = diagnostics.contracts.filter((contract) => contract.hasCode);

  return (
    <div className="space-y-9">
      <section>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="mono-label text-danger">Live network · local Hardhat</span>
          <span className="chip">chain {diagnostics.chainId ?? "—"}</span>
          <span className="chip">block {blockNumber ?? "—"}</span>
          <span className="chip">{diagnostics.rpcUrl}</span>
        </div>

        <h1 className="max-w-4xl text-balance text-[34px] font-semibold leading-[1.02] tracking-[-0.035em] text-body sm:text-[44px] lg:text-[52px]">
          The chain is running.
          <br />
          <span className="text-danger">These reads are not fixtures.</span>
        </h1>
        <p className="mt-4 max-w-3xl text-[14px] leading-relaxed text-dim">
          Six proposals are seeded on the local Hardhat node. Governor state, version
          chains, commitments and votes below are read from the deployed contracts.
          The AIP-042 narrative on the other screens remains a labelled reference model.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/trail" className="btn btn-primary">
            Open the narrative trail
          </Link>
          <Link href="/docs" className="btn">
            How to run the chain
          </Link>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Panel className="p-4">
          <div className="mono-label">RPC</div>
          <div className="mt-2 flex items-center gap-2">
            <span
              className={`status-dot ${diagnostics.rpcReachable ? "text-safe" : "text-danger"}`}
            />
            <span className="text-[15px] font-medium text-body">
              {diagnostics.rpcReachable ? "Reachable" : "Offline"}
            </span>
          </div>
          <div className="mt-1 truncate font-mono text-[10px] text-faint">
            {diagnostics.rpcUrl}
          </div>
        </Panel>
        <Panel className="p-4">
          <div className="mono-label">Chain</div>
          <div className="mt-2 text-[15px] font-medium text-body">
            {diagnostics.chainId ?? "—"}
          </div>
          <div className="mt-1 font-mono text-[10px] text-faint">
            manifest {diagnostics.manifestChainId} ·{" "}
            {diagnostics.chainIdMatch ? "match" : "mismatch"}
          </div>
        </Panel>
        <Panel className="p-4">
          <div className="mono-label">Contracts with code</div>
          <div className="mt-2 text-[15px] font-medium text-body">
            {liveContracts.length} / {diagnostics.contracts.length}
          </div>
          <div className="mt-1 font-mono text-[10px] text-faint">
            {diagnostics.demoState.allMatched
              ? "demo state matches chain"
              : diagnostics.demoState.checked
                ? "demo state drift"
                : "demo state not checked"}
          </div>
        </Panel>
        <Panel className="p-4">
          <div className="mono-label">Proposals</div>
          <div className="mt-2 text-[15px] font-medium text-body">{rows.length}</div>
          <div className="mt-1 font-mono text-[10px] text-faint">
            {rows.filter((row) => row.chain?.state === "VotingOpen").length} open ·{" "}
            {rows.filter((row) => row.chain?.state === "Executed").length} executed
          </div>
        </Panel>
      </section>

      {listError ? (
        <Panel className="border-danger/30 p-5">
          <div className="mono-label text-danger">Chain read failed</div>
          <p className="mt-2 text-[13px] leading-relaxed text-dim">
            {listError}. Start the local node with{" "}
            <code className="font-mono text-[12px] text-body">npx hardhat node</code> and
            deploy with <code className="font-mono text-[12px] text-body">npm run deploy</code>.
          </p>
        </Panel>
      ) : null}

      <section>
        <SectionHeader
          eyebrow="Governor reads"
          title="Proposals on this chain"
          description="State labels come from IntentGovernor, not from the fixture index. Seed notes are shown separately."
          right={
            <div className="flex items-center gap-2">
              <span className="chip">{rows.length} rows</span>
              <span className="chip border-danger/30 text-danger">
                {rows.filter((row) => row.chain?.state === "VotingOpen").length} voting
              </span>
            </div>
          }
        />
        <Panel className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-left">
              <thead>
                <tr className="border-b border-edge">
                  {["ID", "Proposal", "Chain state", "Ver.", "Commitment", "For / against", ""].map(
                    (head) => (
                      <th
                        key={head}
                        className="px-4 py-3 font-mono text-[9px] uppercase tracking-[0.12em] text-faint"
                      >
                        {head}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const state = row.chain?.state ?? row.seed?.state ?? "Drafted";
                  const versions =
                    row.seed?.versionChain.length ?? row.chain?.version ?? "—";
                  const commitment = row.chain?.commitment ?? row.seed?.commitment ?? null;
                  return (
                    <tr
                      key={row.proposal.id}
                      className="border-b border-edge/70 last:border-0 hover:bg-white/40"
                    >
                      <td className="px-4 py-3 font-mono text-[10px] text-faint">
                        #{row.proposal.id}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/live/${row.proposal.id}`}
                          className="text-[13px] font-medium text-body hover:text-danger"
                        >
                          {row.proposal.title}
                        </Link>
                        <div className="mt-0.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-faint">
                          gov {row.proposal.govId || "—"} · seed {row.seed?.state ?? "—"}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill status={stateTone(state)}>{state}</StatusPill>
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-steel">{versions}</td>
                      <td className="px-4 py-3 font-mono text-[10.5px] text-steel">
                        {short(commitment, 8, 6)}
                      </td>
                      <td className="px-4 py-3 font-mono text-[10.5px] text-steel">
                        {row.chain
                          ? `${votes(row.chain.forVotes)} / ${votes(row.chain.againstVotes)}`
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/live/${row.proposal.id}`}
                          className="font-mono text-[9px] uppercase tracking-[0.1em] text-danger hover:text-body"
                        >
                          open →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
        {rows.some((row) => row.seed?.state === "Challenged") ? (
          <p className="mt-2 text-[10.5px] text-faint">
            Seed note: proposal 3 is labelled <b>Challenged</b> by the disclosure seed; the
            governor state above is the on-chain state.
          </p>
        ) : null}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          <SectionHeader
            eyebrow="Deployment"
            title="Contracts on this node"
            description="Addresses and bytecode presence read from deployments/local.json and the RPC."
          />
          <Panel className="p-4">
            <div className="grid gap-x-5 gap-y-2 sm:grid-cols-2">
              {diagnostics.contracts.map((contract) => (
                <div
                  key={contract.name}
                  className="flex items-center justify-between gap-3 border-b border-edge/60 py-2 last:border-0"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[11.5px] text-body">{contract.name}</div>
                    <div className="truncate font-mono text-[9px] text-faint">
                      {short(contract.address, 8, 6)}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 font-mono text-[8.5px] uppercase tracking-[0.08em] ${
                      contract.hasCode ? "text-safe" : "text-danger"
                    }`}
                  >
                    {contract.hasCode ? "code" : "no code"}
                  </span>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <div>
          <SectionHeader
            eyebrow="Sentinel watcher"
            title="Live events"
            description="Read from the watcher store; polls every 12 seconds. Empty until the watcher runs."
          />
          <LiveWatcher />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {rows.slice(0, 3).map((row) => (
          <Panel key={row.proposal.id} className="p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="mono-label">Seed note #{row.proposal.id}</span>
              <StatusPill status={stateTone(row.seed?.state ?? "Drafted")}>
                {row.seed?.state ?? "Drafted"}
              </StatusPill>
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-dim">
              {row.seed?.notes ?? "No seed note recorded."}
            </p>
          </Panel>
        ))}
      </section>

      <section className="panel p-5">
        <div className="mono-label">Raw endpoints</div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/api/status" prefetch={false} className="btn btn-sm">
            /api/status
          </Link>
          <Link href="/api/live/proposals" prefetch={false} className="btn btn-sm">
            /api/live/proposals
          </Link>
          <Link href="/api/watcher/events" prefetch={false} className="btn btn-sm">
            /api/watcher/events
          </Link>
          <Link href="/api/scorecard" prefetch={false} className="btn btn-sm">
            /api/scorecard
          </Link>
        </div>
        <p className="mt-3 max-w-3xl text-[11px] leading-relaxed text-faint">
          These endpoints run against the local Hardhat node. If the node stops, the page
          reports a chain-read failure instead of showing stale values.
        </p>
      </section>
    </div>
  );
}
