"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/ui";

type Status = "idle" | "pending" | "ok" | "error";

export function LiveVote({ govId }: { govId: string }) {
  const router = useRouter();
  const [accountIndex, setAccountIndex] = useState(2);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  async function castVote() {
    setStatus("pending");
    setMessage(null);
    setTxHash(null);

    try {
      const response = await fetch("/api/live/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          govId,
          withBrief: false,
          accountIndex,
        }),
      });
      const payload = (await response.json()) as {
        message?: string;
        hash?: string;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? response.statusText);
      }
      setStatus("ok");
      setMessage(payload.message ?? "Vote cast.");
      setTxHash(payload.hash ?? null);
      router.refresh();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <Panel className="p-5">
      <div className="mono-label text-danger">Live transaction</div>
      <p className="mt-2 max-w-2xl text-[12px] leading-relaxed text-dim">
        This sends a real FOR vote to the local Hardhat governor using one of the dev
        voter accounts. It is a demo transaction, not the AIP-042 narrative. If the
        selected voter has already voted, the governor reverts and the error is shown.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="mono-label">Dev voter</span>
          <select
            value={accountIndex}
            onChange={(event) => setAccountIndex(Number(event.target.value))}
            className="border border-edge2 bg-panel px-2 py-1.5 font-mono text-[11px] text-body"
          >
            <option value={0}>Voter 1</option>
            <option value={1}>Voter 2</option>
            <option value={2}>Voter 3</option>
          </select>
        </label>
        <button
          type="button"
          onClick={castVote}
          disabled={status === "pending"}
          className="btn btn-primary btn-sm"
        >
          {status === "pending" ? "Sending…" : "Cast FOR vote"}
        </button>
        <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-faint">
          local chain only
        </span>
      </div>

      {message ? (
        <div
          className={`mt-4 border px-3 py-2 text-[11px] leading-relaxed ${
            status === "ok"
              ? "border-safe/40 bg-safe/5 text-safe"
              : "border-danger/40 bg-danger/5 text-danger"
          }`}
        >
          <div>{message}</div>
          {txHash ? (
            <div className="mt-1 break-all font-mono text-[9px] text-faint">{txHash}</div>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}
