import Link from "next/link";
import { ArrowRight, ShieldAlert } from "lucide-react";
import { getDemo } from "@/lib/demo";
import {
  ModelBadge,
  PageHeader,
  Panel,
  Stat,
} from "@/components/ui";
import { ArenaRunner } from "./ArenaRunner";

export const metadata = { title: "Red-team arena" };

export default function ArenaPage() {
  const demo = getDemo();
  const summary = demo.arenaSummary;
  const executorCount = demo.scenarioRows.filter(
    (row) => row.scenario.layer === "executor",
  ).length;
  const sentinelCount = demo.scenarioRows.filter(
    (row) => row.scenario.layer === "sentinel",
  ).length;
  const disclosureCount = demo.scenarioRows.filter(
    (row) => row.scenario.layer === "disclosure",
  ).length;

  return (
    <>
      <PageHeader
        eyebrow="Red-team arena · AIP-042"
        title={
          <>
            Run the attack.
            <br />
            <span className="text-signal">Show the layer.</span>
          </>
        }
        description="Eleven scenarios are replayed against the committed AIP-042 intent. Each row prints the expected verdict next to the actual one — executor rules, sentinel simulation, or disclosure challenge — so a pass is never taken on faith."
        meta={
          <>
            <ModelBadge />
            <span className="chip">no chain running</span>
          </>
        }
        actions={
          <>
            <Link href="/arena/03-jargon-upgrade" className="btn btn-primary">
              Trace scenario 03
              <ArrowRight size={13} />
            </Link>
            <a href="#scenarios" className="btn">
              Scenario ledger
            </a>
          </>
        }
      />

      <Panel accent className="mb-5 flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center">
        <span className="grid size-8 shrink-0 place-items-center rounded border border-signal/35 bg-signal/8 text-signal">
          <ShieldAlert size={16} strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="mono-label text-signal">Scope · read this before the verdicts</div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-body">
            Reference model (TypeScript) — Solidity executor pending Person A. Verdicts come from
            real calldata encoding/decoding and rule checks; no chain is running.
          </p>
        </div>
        <span className="chip shrink-0 border-signal/30 text-signal">
          no RPC · no fork · no broadcast
        </span>
      </Panel>

      <Panel className="mb-5 p-4">
        <div className="grid gap-5 sm:grid-cols-3 lg:grid-cols-5">
          <Stat
            label="Scenarios"
            value={summary.total}
            sub={`${executorCount} executor · ${sentinelCount} sentinel · ${disclosureCount} disclosure`}
          />
          <Stat
            label="Rejected"
            value={summary.rejected}
            tone="danger"
            sub="executor refused the calldata"
          />
          <Stat
            label="Flagged"
            value={summary.flagged}
            tone="warn"
            sub="early warning, not execution"
          />
          <Stat
            label="Passed"
            value={summary.passed}
            tone="safe"
            sub="matched the commitment exactly"
          />
          <Stat
            label="Expected mismatches"
            value={summary.mismatches}
            tone={summary.mismatches === 0 ? "safe" : "danger"}
            sub="actual vs. fixture expectation"
          />
        </div>
      </Panel>

      <ArenaRunner />
    </>
  );
}
