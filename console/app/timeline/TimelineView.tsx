"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  FileCheck2,
  FileText,
  Fingerprint,
  GitBranch,
  ShieldCheck,
  X,
} from "lucide-react";
import { getDemo, type VersionRecord } from "@/lib/demo";
import { verifyDocument } from "@/packages/shared/evidence";
import { ENTITY_LABELS } from "@/packages/shared/addresses";
import { formatTimestamp, shortAddress, shortHex } from "@/packages/shared/format";
import type { ActionSpec } from "@/packages/shared/schemas";
import { CopyButton } from "@/components/CopyButton";
import {
  ArrowLink,
  Callout,
  HashLine,
  Panel,
  SectionHeader,
  Stat,
  StatusPill,
  cn,
} from "@/components/ui";

type Verification = { hashMatches: boolean; proofValid: boolean; computedHash: string };

function entity(address: string): string {
  return ENTITY_LABELS[address.toLowerCase()]?.label ?? shortAddress(address);
}

function actionSummary(action: ActionSpec): string {
  switch (action.kind) {
    case "ERC20_TRANSFER":
      return `Transfer ${Number(BigInt(action.maxAmount) / 1_000_000n).toLocaleString("en-US")} USDC → ${entity(action.counterparty)}`;
    case "ERC20_APPROVE":
      return `Approve ${Number(BigInt(action.maxAmount) / 1_000_000n).toLocaleString("en-US")} USDC → ${entity(action.counterparty)}`;
    case "UPGRADE":
      return `Upgrade ${entity(action.target)} → ${entity(action.counterparty)}`;
    case "OWNERSHIP_TRANSFER":
      return `Transfer ownership of ${entity(action.target)} → ${entity(action.counterparty)}`;
    default:
      return action.label ?? action.kind;
  }
}

function HashRow({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="mono-label">{label}</span>
        <CopyButton value={value} compact />
      </div>
      <code className={cn("hash block min-w-0 max-w-full truncate", muted && "text-faint")}>{value}</code>
    </div>
  );
}

function VersionCard({ version, current }: { version: VersionRecord; current: boolean }) {
  const rulesUnchanged = version.version === 3;
  return (
    <Panel className={cn("p-4", current && "border-signal/30")}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded border border-edge font-mono text-[10px] text-faint">
              v{version.version}
            </span>
            <span className="text-[13px] font-medium text-body">{version.note}</span>
          </div>
          <div className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.08em] text-faint">
            {formatTimestamp(version.createdAt)} · {version.author}
          </div>
        </div>
        <StatusPill status={current ? "GREEN" : "NEUTRAL"}>{current ? "current" : "superseded"}</StatusPill>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-dim">{version.changeSummary}</p>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="chip">{version.actions.length} rules</span>
        <span className="chip">{version.assumptions.length} assumptions</span>
        {rulesUnchanged ? <span className="chip border-safe/30 text-safe">rules unchanged</span> : null}
      </div>

      <div className="mt-3 border-t border-edge/70 pt-2">
        <HashRow label="content hash (version)" value={version.contentHash} />
        <HashRow label="previous version" value={version.prevVersionHash} muted={version.version === 1} />
        <HashRow label="intent hash (rules)" value={version.intentHash} />
      </div>

      <details className="group mt-2 border-t border-edge/70 pt-2">
        <summary className="flex cursor-pointer list-none items-center justify-between font-mono text-[9px] uppercase tracking-[0.08em] text-dim hover:text-body">
          all anchors
          <ArrowDown size={11} className="transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-1">
          <HashRow label="evidence root" value={version.evidenceRoot} />
          <HashRow label="financial assumptions" value={version.financialAssumptionsHash} />
          <HashRow
            label="technical assessment"
            value={
              version.technicalAssessmentHash === `0x${"0".repeat(64)}`
                ? "not included in this version"
                : version.technicalAssessmentHash
            }
            muted={version.technicalAssessmentHash === `0x${"0".repeat(64)}`}
          />
          <HashRow label="disclosure" value={version.disclosureHash} />
        </div>
      </details>

      <details className="group mt-1 border-t border-edge/70 pt-2">
        <summary className="flex cursor-pointer list-none items-center justify-between font-mono text-[9px] uppercase tracking-[0.08em] text-dim hover:text-body">
          {version.actions.length} rules in this version
          <ArrowDown size={11} className="transition-transform group-open:rotate-180" />
        </summary>
        <ul className="mt-2 space-y-1.5">
          {version.actions.map((action, index) => (
            <li
              key={`${version.version}-${action.kind}-${index}`}
              className="flex items-start gap-2 text-[10.5px] leading-snug text-dim"
            >
              <span className="mt-0.5 font-mono text-[8.5px] text-faint">
                {String(index + 1).padStart(2, "0")}
              </span>
              {actionSummary(action)}
            </li>
          ))}
        </ul>
        {version.assumptions.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {version.assumptions.map((assumption) => (
              <span key={assumption.name} className="chip">
                {assumption.name}={assumption.value}
              </span>
            ))}
          </div>
        ) : null}
      </details>
    </Panel>
  );
}

export function TimelineView() {
  const demo = getDemo();
  const [verifications, setVerifications] = useState<Record<string, Verification>>({});

  const verifiedCount = useMemo(
    () =>
      Object.values(verifications).filter(
        (verification) => verification.hashMatches && verification.proofValid,
      ).length,
    [verifications],
  );

  function verify(key: string) {
    const doc = demo.manifest.docs.find((candidate) => candidate.key === key);
    if (!doc) return;
    setVerifications((previous) => ({
      ...previous,
      [key]: verifyDocument(doc, demo.manifest),
    }));
  }

  function verifyAll() {
    const next: Record<string, Verification> = {};
    for (const doc of demo.manifest.docs) {
      next[doc.key] = verifyDocument(doc, demo.manifest);
    }
    setVerifications(next);
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Panel className="p-4">
          <Stat label="Versions" value="3" sub="append-only · hash-chained" />
        </Panel>
        <Panel className="p-4">
          <Stat label="Latest rules" value={`${demo.versions[2].actions.length}`} sub="v2 → v3 rules unchanged" tone="safe" />
        </Panel>
        <Panel className="p-4">
          <Stat label="Evidence documents" value={`${demo.manifest.docs.length}`} sub={`${verifiedCount} verified this session`} tone={verifiedCount === 4 ? "safe" : "default"} />
        </Panel>
        <Panel className="p-4">
          <Stat label="Disclosure" value="challenged" sub="post-queue review · simulated" tone="danger" />
        </Panel>
      </div>

      <section>
        <SectionHeader
          eyebrow="Hash chain"
          title="Three versions, one anchor path"
          description="v2 raised the GrowthLabs amount and added two actions. v3 added the technical assessment and an assumption; the rules did not change, but the content hash and evidence root did."
          right={<span className="chip border-safe/30 text-safe">prev → content</span>}
        />
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-[1fr_28px_1fr_28px_1fr]">
          {demo.versions.map((version, index) => (
            <div key={version.version} className="contents">
              <VersionCard version={version} current={index === demo.versions.length - 1} />
              {index < demo.versions.length - 1 ? (
                <div className="flex items-center justify-center py-1 text-faint lg:py-0">
                  <ArrowDown size={14} className="lg:hidden" />
                  <ArrowRight size={14} className="hidden lg:block" />
                </div>
              ) : null}
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-edge pt-3">
          <span className="chip">v2 intentHash == v3 intentHash</span>
          <span className="chip">v2 contentHash != v3 contentHash</span>
          <span className="chip border-signal/30 text-signal">commitment moved</span>
          <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.08em] text-faint">
            current commitment {shortHex(demo.commitment, 8)}
          </span>
          <CopyButton value={demo.commitment} compact />
        </div>
      </section>

      <section>
        <SectionHeader eyebrow="Diff" title="What actually changed" />
        <div className="grid gap-3 md:grid-cols-2">
          <Panel className="p-4">
            <div className="flex items-center gap-2">
              <GitBranch size={13} className="text-signal" />
              <span className="mono-label">v1 → v2 · 08 Oct 2026</span>
            </div>
            <ul className="mt-3 space-y-2 text-[11.5px] leading-relaxed text-dim">
              <li className="flex items-start gap-2">
                <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-signal" />
                GrowthLabs transfer raised from 150,000 to 200,000 USDC.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-signal" />
                Added Developer Guild transfer of 50,000 USDC.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-signal" />
                Added a bounded 5,000 USDC TreasuryOps allowance.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-signal" />
                New intent hash, new content hash, new evidence root (3 documents).
              </li>
            </ul>
          </Panel>
          <Panel className="p-4">
            <div className="flex items-center gap-2">
              <GitBranch size={13} className="text-info" />
              <span className="mono-label">v2 → v3 · 13 Oct 2026</span>
            </div>
            <ul className="mt-3 space-y-2 text-[11.5px] leading-relaxed text-dim">
              <li className="flex items-start gap-2">
                <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-info" />
                Added the technical assessment as a fourth evidence document.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-info" />
                Added <code className="text-steel">upgrade_authorized=false</code> as a sourced assumption.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-info" />
                Rules unchanged: the intent hash is identical.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-info" />
                Content hash and evidence root changed; the commitment is different.
              </li>
            </ul>
          </Panel>
        </div>
      </section>

      <section id="evidence">
        <SectionHeader
          eyebrow="Evidence store"
          title="Re-hash every document in the browser"
          description="Each document is hashed with keccak256 over its UTF-8 bytes. The four leaves are aggregated into a sorted-pair Merkle tree; the root is anchored in v3."
          right={
            <div className="flex items-center gap-2">
              {verifiedCount === demo.manifest.docs.length ? (
                <StatusPill status="GREEN">4/4 verified</StatusPill>
              ) : null}
              <button type="button" onClick={verifyAll} className="btn btn-sm">
                <ShieldCheck size={11} />
                Verify all
              </button>
            </div>
          }
        />
        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-edge px-4 py-3">
            <div className="flex items-center gap-2">
              <Fingerprint size={14} className="text-safe" />
              <span className="text-[12.5px] font-medium text-body">Merkle root</span>
            </div>
            <div className="flex items-center gap-2">
              <code className="hash max-w-[42vw] truncate">{demo.manifest.root}</code>
              <CopyButton value={demo.manifest.root} compact />
            </div>
          </div>
          <div className="divide-y divide-edge/70">
            {demo.manifest.docs.map((doc) => {
              const verification = verifications[doc.key];
              const ok = verification?.hashMatches && verification?.proofValid;
              return (
                <div key={doc.key} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded border border-edge text-faint">
                      <FileText size={14} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[12px] font-medium text-body">{doc.title}</span>
                        <span className="chip">{doc.filename}</span>
                        <span className="chip">{doc.bytes} bytes</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <code className="hash max-w-full truncate">{doc.docHash}</code>
                        <CopyButton value={doc.docHash} compact />
                      </div>
                      {verification ? (
                        <div
                          className={cn(
                            "mt-1.5 flex items-center gap-1.5 text-[10px]",
                            ok ? "text-safe" : "text-danger",
                          )}
                        >
                          {ok ? <Check size={11} /> : <X size={11} />}
                          {ok
                            ? `hash matches anchor · proof valid (${demo.manifest.proofs[doc.key]?.length ?? 0} siblings)`
                            : "verification failed"}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <button type="button" onClick={() => verify(doc.key)} className="btn btn-sm shrink-0">
                    <FileCheck2 size={11} />
                    {verification ? "Re-verify" : "Verify"}
                  </button>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-edge px-4 py-2.5">
            <span className="chip">leaf = keccak256(bytes)</span>
            <span className="chip">parent = keccak256(sorted(a,b))</span>
            <span className="chip">root anchored in v3</span>
            <span className="ml-auto text-[9.5px] text-faint">
              If a document changes, the hash and proof fail. If the root changes, the commitment changes.
            </span>
          </div>
        </Panel>
      </section>

      <section id="disclosure" className="grid grid-cols-1 gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <Panel className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="mono-label mb-1">Signed disclosure · anchored in v3</div>
              <h2 className="text-[14px] font-medium text-body">Nova Labs · 2 wallets</h2>
            </div>
            <StatusPill status="FLAGGED">challenge filed</StatusPill>
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-dim">{demo.proposal.disclosure.statement}</p>
          <div className="mt-3 space-y-1.5">
            {demo.proposal.disclosure.wallets.map((wallet) => (
              <div key={wallet} className="flex items-center justify-between gap-2 rounded border border-edge bg-ink/30 px-2.5 py-2">
                <span className="text-[11px] text-dim">{entity(wallet)}</span>
                <code className="hash">{wallet}</code>
              </div>
            ))}
          </div>
          <div className="mt-3">
            <HashLine label="Disclosure hash" value={demo.disclosureHash} />
            <div className="flex items-center justify-between gap-2 py-2">
              <span className="mono-label">Signature</span>
              <div className="flex items-center gap-2">
                <code className="hash">{shortHex(demo.proposal.disclosure.signature, 8)}</code>
                <CopyButton value={demo.proposal.disclosure.signature} compact />
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-edge/70 py-2">
              <span className="mono-label">Signed at</span>
              <span className="font-mono text-[10.5px] text-steel">{formatTimestamp(demo.proposal.disclosure.signedAt)}</span>
            </div>
          </div>
        </Panel>

        <div className="space-y-3">
          <Callout tone="danger" title="The disclosure omits Nova Ops.">
            A disclosed wallet funded an undisclosed operations wallet, which funded the GrowthLabs
            deployer 19 days before the proposal. The graph finds four links with noisy-OR risk{" "}
            {demo.graph.overallRisk.toFixed(2)}.
          </Callout>
          <Panel className="p-4">
            <div className="mono-label mb-1">Challenge</div>
            <p className="text-[11.5px] leading-relaxed text-dim">{demo.proposal.challenge.claim}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="chip">{demo.proposal.challenge.filer}</span>
              <span className="chip">{formatTimestamp(demo.proposal.challenge.filedAt)}</span>
              <span className="chip border-danger/30 text-danger">{demo.proposal.challenge.status}</span>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <ArrowLink href="/graph">Open the wallet graph</ArrowLink>
              <ArrowLink href={`/arena/${demo.mainRun.scenario.id}`}>Execution report</ArrowLink>
            </div>
          </Panel>
          <Callout tone="warn">
            Challenge verification on-chain is Person A&apos;s DisclosureRegistry. This screen shows
            the payload B generates and the evidence it cites.
          </Callout>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2 border-t border-edge pt-4">
        <Link href="/scorecard" className="arrow-link">
          See the remaining gaps <ArrowUpRight size={12} />
        </Link>
        <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.08em] text-faint">
          Evidence hashes are real · documents are demo seeds
        </span>
      </div>
    </div>
  );
}
