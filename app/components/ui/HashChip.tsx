"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn, truncateMiddle } from "@/lib/format";

export function HashChip({
  value,
  label,
  lead = 12,
  tail = 8,
  className,
}: {
  value?: string | null;
  label?: string;
  lead?: number;
  tail?: number;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  if (!value) {
    return (
      <span className={cn("font-mono text-[11px] text-slate-500", className)}>
        —
      </span>
    );
  }

  const full = value;
  const display = truncateMiddle(full, lead, tail);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(full);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard can be blocked; the full value remains in the tooltip.
    }
  };

  return (
    <span
      className={cn(
        "group relative inline-flex max-w-full items-center gap-1.5 rounded-md border border-slate-800 bg-slate-950/70 px-2 py-1 font-mono text-[11px] tabular-nums text-cyan-300 transition-colors duration-150 hover:border-cyan-900/70",
        className
      )}
    >
      {label ? (
        <span className="text-[10px] uppercase tracking-[0.1em] text-slate-500">
          {label}
        </span>
      ) : null}
      <span className="truncate">{display}</span>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy ${label ?? "value"}`}
        className="text-slate-500 transition-colors duration-150 hover:text-cyan-300"
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden w-max max-w-[360px] -translate-x-1/2 break-all rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-left font-mono text-[10px] leading-relaxed text-slate-300 shadow-xl group-hover:block group-focus-within:block"
      >
        {full}
      </span>
    </span>
  );
}
