import { PageHeader } from "@/components/ui";
import { VoteView } from "./VoteView";
import { getDemo } from "@/lib/demo";
import { formatPercent } from "@/packages/shared/format";

const demo = getDemo();

export const metadata = { title: "Informed voting" };

export default function VotePage() {
  return (
    <>
      <PageHeader
        eyebrow="Informed voting mode · AIP-042"
        title={
          <>
            Read the brief.
            <br />
            <span className="text-signal">Then bind the vote.</span>
          </>
        }
        description="voteWithBrief records the exact brief hash the voter saw. The tally separates informed weight from weight that never viewed the current brief, and the execution gate stays visible on the ballot."
        meta={
          <>
            <span className="chip">voteWithBrief</span>
            <span className="chip border-signal/30 text-signal">informed ratio {formatPercent(demo.voting.metrics.informedRatio)}</span>
            <span className="chip border-danger/30 text-danger">execution blocked</span>
          </>
        }
        actions={
          <>
            <a href="#brief" className="btn">
              Read the brief
            </a>
            <a href="#cast" className="btn btn-primary">
              Cast a vote
            </a>
          </>
        }
      />
      <VoteView />
    </>
  );
}
