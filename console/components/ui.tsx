import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight, Lock } from "lucide-react";
import { CopyButton } from "./CopyButton";

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

export type StatusLike =
  | "GREEN"
  | "AMBER"
  | "RED"
  | "PASS"
  | "FAIL"
  | "PASSED"
  | "REJECTED"
  | "FLAGGED"
  | "TEST_REQUIRED"
  | "OK"
  | "NEUTRAL";

export function statusTone(status: StatusLike): "safe" | "warn" | "danger" | "neutral" {
  switch (status) {
    case "GREEN":
    case "PASS":
    case "PASSED":
    case "OK":
      return "safe";
    case "AMBER":
    case "FLAGGED":
    case "TEST_REQUIRED":
      return "warn";
    case "RED":
    case "FAIL":
    case "REJECTED":
      return "danger";
    default:
      return "neutral";
  }
}

const PILL_STYLES = {
  safe: "border-safe/35 bg-safe/8 text-safe",
  warn: "border-signal/35 bg-signal/8 text-signal",
  danger: "border-danger/35 bg-danger/8 text-danger",
  neutral: "border-edge2 bg-white/3 text-dim",
} as const;

const DOT_STYLES = {
  safe: "bg-safe",
  warn: "bg-signal",
  danger: "bg-danger",
  neutral: "bg-dim",
} as const;

export function StatusPill({
  status,
  children,
  className,
}: {
  status: StatusLike;
  children?: ReactNode;
  className?: string;
}) {
  const tone = statusTone(status);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.1em]",
        PILL_STYLES[tone],
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", DOT_STYLES[tone])} />
      {children ?? status}
    </span>
  );
}

const TONE_TEXT = {
  safe: "text-safe",
  warn: "text-signal",
  danger: "text-danger",
  neutral: "text-dim",
} as const;

export function statusTextClass(status: StatusLike): string {
  return TONE_TEXT[statusTone(status)];
}

export function LayerBadge({ layer }: { layer: "executor" | "sentinel" | "disclosure" }) {
  const styles = {
    executor: "border-edge2 bg-white/3 text-steel",
    sentinel: "border-info/30 bg-info/8 text-info",
    disclosure: "border-signal/30 bg-signal/8 text-signal",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex rounded border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.1em]",
        styles[layer],
      )}
    >
      layer · {layer}
    </span>
  );
}

export function ModelBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded border border-signal/30 bg-signal/6 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.1em] text-signal",
        className,
      )}
    >
      Reference model · Solidity pending
    </span>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
}: {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <header className="mb-7 border-b border-edge pb-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="mono-label text-signal">{eyebrow}</span>
            {meta}
          </div>
          <h1 className="text-balance text-[28px] font-semibold leading-[1.08] tracking-[-0.02em] text-body sm:text-[34px]">
            {title}
          </h1>
          {description ? (
            <p className="mt-3 max-w-2xl text-[13.5px] leading-relaxed text-dim">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  right,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow ? <div className="mono-label mb-1.5">{eyebrow}</div> : null}
        <h2 className="text-[17px] font-medium tracking-[-0.01em] text-body">{title}</h2>
        {description ? <p className="mt-1.5 max-w-2xl text-[12.5px] leading-relaxed text-dim">{description}</p> : null}
      </div>
      {right}
    </div>
  );
}

export function Panel({
  children,
  className,
  accent = false,
  id,
}: {
  children: ReactNode;
  className?: string;
  accent?: boolean;
  id?: string;
}) {
  return (
    <div id={id} className={cn("panel", accent && "panel-accent", className)}>
      {children}
    </div>
  );
}

export function ScoreRing({
  score,
  status,
  size = 64,
  label,
  hardGate = false,
}: {
  score: number | null;
  status: StatusLike;
  size?: number;
  label?: string;
  hardGate?: boolean;
}) {
  const tone = statusTone(status);
  const stroke = tone === "safe" ? "#43d99a" : tone === "warn" ? "#f1b54a" : tone === "danger" ? "#ff6464" : "#596675";
  const radius = size / 2 - 4;
  const circumference = 2 * Math.PI * radius;
  const value = score === null ? 0 : Math.max(0, Math.min(1, score));
  const offset = circumference * (1 - value);

  return (
    <div className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#1b2530"
          strokeWidth={2.5}
        />
        {hardGate ? (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={stroke}
            strokeWidth={2.5}
            strokeDasharray={`${circumference * 0.12} ${circumference}`}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            opacity={0.7}
          />
        ) : (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={stroke}
            strokeWidth={2.5}
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: "stroke-dashoffset 500ms ease" }}
          />
        )}
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        {hardGate ? (
          <div className="flex flex-col items-center gap-0.5 text-danger">
            <Lock size={15} strokeWidth={1.8} />
            <span className="font-mono text-[7.5px] uppercase tracking-[0.12em]">gate</span>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <span className="font-mono text-[15px] font-medium leading-none text-body" style={{ color: stroke }}>
              {score === null ? "—" : score.toFixed(2)}
            </span>
            {label ? (
              <span className="mt-0.5 font-mono text-[7.5px] uppercase tracking-[0.12em] text-faint">{label}</span>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

export function RiskMeter({
  value,
  status,
  threshold = 0.65,
  className,
}: {
  value: number;
  status: StatusLike;
  threshold?: number;
  className?: string;
}) {
  const color = statusTone(status) === "danger" ? "#ff6464" : statusTone(status) === "warn" ? "#f1b54a" : "#43d99a";
  return (
    <div className={cn("relative h-1.5 w-full overflow-hidden rounded-full bg-edge", className)}>
      <div
        className="h-full rounded-full"
        style={{ width: `${Math.min(100, value * 100)}%`, background: color, transition: "width 500ms ease" }}
      />
      <div
        className="absolute -top-1 h-3.5 w-px bg-body/50"
        style={{ left: `${Math.min(100, threshold * 100)}%` }}
        title={`Red threshold ${(threshold * 100).toFixed(0)}%`}
      />
    </div>
  );
}

export function HashLine({
  label,
  value,
  full = false,
  className,
}: {
  label: string;
  value: string;
  full?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5 border-b border-edge/70 py-2.5 last:border-0", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="mono-label">{label}</span>
        <CopyButton value={value} compact />
      </div>
      <code className={cn("hash block min-w-0 max-w-full", !full && "truncate")}>{value}</code>
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "default" | "safe" | "warn" | "danger";
}) {
  const toneClass =
    tone === "safe" ? "text-safe" : tone === "warn" ? "text-signal" : tone === "danger" ? "text-danger" : "text-body";
  return (
    <div className="min-w-0">
      <div className="mono-label">{label}</div>
      <div className={cn("mt-1.5 font-mono text-[20px] leading-none tracking-tight", toneClass)}>{value}</div>
      {sub ? <div className="mt-1.5 text-[11px] leading-snug text-faint">{sub}</div> : null}
    </div>
  );
}

export function Callout({
  tone = "neutral",
  title,
  children,
  className,
}: {
  tone?: "safe" | "warn" | "danger" | "info" | "neutral";
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const styles = {
    safe: "border-safe/30 bg-safe/5",
    warn: "border-signal/30 bg-signal/5",
    danger: "border-danger/30 bg-danger/5",
    info: "border-info/30 bg-info/5",
    neutral: "border-edge bg-white/2",
  } as const;
  return (
    <div className={cn("rounded-lg border px-4 py-3", styles[tone], className)}>
      {title ? <div className="mb-1 text-[12.5px] font-medium text-body">{title}</div> : null}
      <div className="text-[12px] leading-relaxed text-dim">{children}</div>
    </div>
  );
}

export function ArrowLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link href={href} className={cn("arrow-link", className)}>
      {children}
      <ArrowUpRight size={13} strokeWidth={1.8} />
    </Link>
  );
}

export function MonoLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("mono-label", className)}>{children}</span>;
}

export function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-edge/60 py-2 last:border-0">
      <span className="mono-label shrink-0">{label}</span>
      <span className="min-w-0 text-right text-[12px] text-body">{children}</span>
    </div>
  );
}
