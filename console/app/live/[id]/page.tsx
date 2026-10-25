import Link from "next/link";
import { notFound } from "next/navigation";
import { formatUnits } from "ethers";
import {
  liveGetProposals,
  liveGetVersionChain,
  liveGetVotingState,
} from "@/lib/live";
import type { Proposal, VersionChain, VotingState } from "@/lib/types";
import { LiveVote } from "@/components/LiveVote";
import {
  HashLine,
  KeyValue,
  Panel,
  SectionHeader,
  StatusPill,
  type StatusLike,
} from "@/components/ui";

export const dynamic = "force-dynamic";

function short(value: string | null | undefined, head = 8, tail = 6): string {
  if (!value) return "—";
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function tokens(value: string | undefined): string {
  if (!value) return "—";
  try {
    return Number(formatUnits(BigInt(value), 18)).toLocaleString("en-US", {
      maximumFractionDigits: 0,
    });
  } catch {
    return value;
  }
}

function when(value: string | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function stateTone(state: string | undefined): StatusLike {
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
    case "Passed":
      return "PASSED";
    default:
      return "NEUTRAL";
  }
}

export default async function LiveProposalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let proposals: Proposal[] = [];
  let listError: string | null = null;
  try {
    proposals = await liveGetProposals();
  } catch (error) {
    listError = error instanceof Error ? error.message : String(error);
  }

  const proposal = proposals.find((candidate) => candidate.id === id);
  if (!proposal && !listError) notFound();

  let chain: VotingState | null = null;
  let chainError: string | null = null;
  if (proposal?.govId) {
    try {
      chain = await liveGetVotingState(proposal.govId);
    } catch (error) {
      chainError = error instanceof Error ? error.message : String(error);
    }
  }

  let versions: VersionChain | null = null;
  let versionError: string | null = null;
  try {
    versions = await liveGetVersionChain(id);
  } catch (error) {
    versionError = error instanceof Error ? error.message : String(error);
  }

  if (listError) {
    return (
      <Panel className="border-danger/30 p-6">
        <div className="mono-label text-danger">Chain read failed</div>
        <p className="mt-2 text-[13px] leading-relaxed text-dim">{listError}</p>
        <Link href="/live" className="btn btn-sm mt-4">
          Back to live network
        </Link>
      </Panel>
    );
  }

  const state = chain?.state ?? "Drafted";

  return (
    <div className="space-y-9">
      <section>
        <Link
          href="/live"
          className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-faint hover:text-body"
        >
          ← Live network
        </Link>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="mono-label text-danger">Proposal #{proposal?.id ?? id}</span>
          <span className="chip">gov {proposal?.govId || "not submitted"}</span>
          <StatusPill status={stateTone(state)}>{state}</StatusPill>
        </div>
        <h1 className="mt-3 max-w-4xl text-balance text-[32px] font-semibold leading-[1.04] tracking-[-0.03em] text-body sm:text-[42px]">
          {proposal?.title ?? "Unknown proposal"}
        </h1>
        <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-dim">
          This page reads the proposal registry, the version chain and the governor
          directly from the local Hardhat node. Nothing below is a fixture.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Panel className="p-4">
          <div className="mono-label">Governor state</div>
          <div className="mt-2 text-[15px] font-medium text-body">{state}</div>
          <div className="mt-1 font-mono text-[10px] text-faint">
            code {chain?.stateCode ?? "—"}
          </div>
        </Panel>
        <Panel className="p-4">
          <div className="mono-label">Version</div>
          <div className="mt-2 text-[15px] font-medium text-body">
            {chain?.version ?? versions?.versions.length ?? "—"}
          </div>
          <div className="mt-1 font-mono text-[10px] text-faint">
            {versions?.valid ? "chain valid" : versions ? "chain unverified" : "no versions"}
          </div>
        </Panel>
        <Panel className="p-4">
          <div className="mono-label">For / against / abstain</div>
          <div className="mt-2 font-mono text-[12px] text-body">
            {tokens(chain?.forVotes)} / {tokens(chain?.againstVotes)} /{" "}
            {tokens(chain?.abstainVotes)}
          </div>
          <div className="mt-1 font-mono text-[10px] text-faint">
            quorum {chain?.quorumReached ? "reached" : "not reached"}
          </div>
        </Panel>
        <Panel className="p-4">
          <div className="mono-label">Informed ratio</div>
          <div className="mt-2 text-[15px] font-medium text-body">
            {chain ? `${Math.round(chain.informedRatio * 100)}%` : "—"}
          </div>
          <div className="mt-1 font-mono text-[10px] text-faint">
            {chain
              ? `${tokens(chain.informedForVotes)} informed of ${tokens(chain.forVotes)} for`
              : "no governor record"}
          </div>
        </Panel>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <SectionHeader
            eyebrow="Governor"
            title="Commitment and voting"
            description="Values read from IntentGovernor.getGovProposal and the informed-vote counters."
          />
          <Panel className="p-5">
            {chain ? (
              <div className="space-y-1">
                <KeyValue label="Commitment">
                  <span className="font-mono text-[10.5px]">{short(chain.commitment, 12, 10)}</span>
                </KeyValue>
                <KeyValue label="Version hash">
                  <span className="font-mono text-[10.5px]">{short(chain.versionHash, 12, 10)}</span>
                </KeyValue>
                <KeyValue label="Intent hash">
                  <span className="font-mono text-[10.5px]">{short(chain.intentHash, 12, 10)}</span>
                </KeyValue>
                <KeyValue label="Vote window">
                  <span className="font-mono text-[10px]">
                    {when(chain.voteStart)} → {when(chain.voteEnd)}
                  </span>
                </KeyValue>
                <KeyValue label="Snapshot block">
                  <span className="font-mono text-[10.5px]">{chain.snapshotBlock}</span>
                </KeyValue>
                <KeyValue label="Proposer">
                  <span className="font-mono text-[10.5px]">{short(chain.proposer, 10, 8)}</span>
                </KeyValue>
                <KeyValue label="Brief acknowledgements">
                  <span className="font-mono text-[10.5px]">{chain.totalBriefAcks}</span>
                </KeyValue>
              </div>
            ) : (
              <div className="text-[12.5px] leading-relaxed text-dim">
                {chainError ??
                  "This proposal has not been submitted to the governor, so there is no voting record."}
              </div>
            )}
          </Panel>
        </div>

        <div>
          <SectionHeader
            eyebrow="Registry"
            title="Version chain"
            description="Append-only content hashes read from ProposalRegistry."
          />
          <Panel className="p-5">
            {versions && versions.versions.length > 0 ? (
              <ol className="space-y-4">
                {versions.versions.map((version) => (
                  <li key={version.versionHash} className="border-b border-edge/60 pb-4 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-body">
                        v{version.version}
                      </span>
                      <span className="font-mono text-[9px] text-faint">
                        {when(version.timestamp)}
                      </span>
                    </div>
                    <div className="mt-2">
                      <HashLine label="version hash" value={version.versionHash} />
                      <HashLine label="previous" value={version.prevVersionHash} />
                      <HashLine label="content" value={version.contentHash} />
                      <HashLine label="evidence root" value={version.evidenceRoot} />
                    </div>
                    <p className="mt-2 text-[11px] leading-relaxed text-dim">
                      {version.contentPreview || "No preview recorded."}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="text-[12.5px] leading-relaxed text-dim">
                {versionError ?? "No versions found for this proposal."}
              </div>
            )}
          </Panel>
        </div>
      </section>

      {chain?.state === "VotingOpen" ? (
        <section>
          <SectionHeader
            eyebrow="Write path"
            title="Cast a live vote"
            description="The endpoint signs with a local Hardhat dev voter and submits the transaction to IntentGovernor."
          />
          <LiveVote govId={proposal?.govId ?? ""} />
        </section>
      ) : null}

      <section className="panel p-5">
        <div className="mono-label">Raw reads</div>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={`/api/live/version-chain?proposalId=${encodeURIComponent(id)}`}
            className="btn btn-sm"
          >
            version chain JSON
          </a>
          {proposal?.govId ? (
            <a
              href={`/api/live/voting-state?govId=${encodeURIComponent(proposal.govId)}`}
              className="btn btn-sm"
            >
              voting state JSON
            </a>
          ) : null}
          {proposal?.govId ? (
            <a
              href={`/api/live/verify-chain?proposalId=${encodeURIComponent(id)}`}
              className="btn btn-sm"
            >
              verify chain JSON
            </a>
          ) : null}
        </div>
      </section>
    </div>
  );
}
