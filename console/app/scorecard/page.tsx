import { PageHeader } from "@/components/ui";
import { ScorecardView } from "./ScorecardView";
import scorecardJson from "@/packages/shared/fixtures/scorecard.json";
import type { ScorecardEntry } from "@/packages/shared/schemas";

const entries = scorecardJson as unknown as ScorecardEntry[];
const failed = entries.filter((entry) => entry.status === "FAIL").length;
const required = entries.filter((entry) => entry.status === "TEST_REQUIRED").length;

export const metadata = { title: "Security scorecard" };

export default function ScorecardPage() {
  return (
    <>
      <PageHeader
        eyebrow="Governance security scorecard"
        title={
          <>
            Real runs.
            <br />
            <span className="text-signal">Honest gaps.</span>
          </>
        }
        description="Every green row comes from an executed check against this workspace. Properties that need Solidity are TEST_REQUIRED — shown amber, never green — until Person A's contracts and test suite land."
        meta={
          <>
            <span className="chip border-safe/30 text-safe">{failed} failed</span>
            <span className="chip border-signal/30 text-signal">{required} test required</span>
            <span className="chip">reference model</span>
          </>
        }
        actions={
          <>
            <a href="#checks" className="btn">
              Checks
            </a>
            <a href="#gaps" className="btn">
              Gaps
            </a>
          </>
        }
      />
      <ScorecardView />
    </>
  );
}
