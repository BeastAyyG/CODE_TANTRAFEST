"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck } from "lucide-react";

const NAV = [
  { href: "/", label: "Trail" },
  { href: "/intent", label: "Intent" },
  { href: "/graph", label: "Graph" },
  { href: "/timeline", label: "Timeline" },
  { href: "/vote", label: "Vote" },
  { href: "/arena", label: "Arena" },
  { href: "/scorecard", label: "Scorecard" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="relative flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-edge bg-ink/92 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[1480px] items-center gap-5 px-5 py-3">
          <Link href="/" className="group flex shrink-0 items-center gap-3">
            <span className="grid size-8 place-items-center rounded-md border border-signal/40 bg-signal/8 text-signal">
              <ShieldCheck size={17} strokeWidth={1.7} />
            </span>
            <span className="flex items-baseline gap-2">
              <span className="font-mono text-[15px] font-medium tracking-[0.2em] text-body">
                AEGIS
              </span>
              <span className="font-mono text-[10px] tracking-[0.16em] text-signal">
                INTENTLOCK
              </span>
            </span>
          </Link>

          <span className="hidden h-4 w-px bg-edge2 xl:block" />
          <span className="mono-label hidden xl:block">Decision integrity console</span>

          <nav className="ml-auto hidden items-center gap-0.5 lg:flex" aria-label="Primary">
            {NAV.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`relative px-2.5 py-2 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors ${
                    active ? "text-body" : "text-dim hover:text-body"
                  }`}
                >
                  {item.label}
                  {active ? (
                    <span className="absolute inset-x-2.5 -bottom-[13px] h-px bg-signal" />
                  ) : null}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2 lg:ml-3">
            <span className="hidden items-center gap-2 rounded border border-edge bg-white/2 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.1em] text-dim sm:inline-flex">
              <span className="status-dot text-safe" />
              local · chain 31337
            </span>
            <span className="hidden items-center gap-1.5 rounded border border-signal/30 bg-signal/8 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.1em] text-signal md:inline-flex">
              reference model
            </span>
          </div>
        </div>

        <nav
          className="flex items-center gap-1 overflow-x-auto border-t border-edge px-4 py-2 lg:hidden"
          aria-label="Primary mobile"
        >
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`shrink-0 rounded px-2.5 py-1.5 font-mono text-[9.5px] uppercase tracking-[0.1em] ${
                  active ? "bg-signal/12 text-signal" : "text-dim hover:text-body"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-[1480px] flex-1 px-4 pb-20 pt-6 sm:px-5 sm:pt-8">
        {children}
      </main>

      <footer className="relative z-10 border-t border-edge">
        <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-2 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-faint">
            AegisDAO IntentLock · demo workspace · simulated wallet data · no network calls
          </p>
          <p className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-faint">
            Solidity executor pending Person A · verdicts from a TypeScript reference model
          </p>
        </div>
      </footer>
    </div>
  );
}
