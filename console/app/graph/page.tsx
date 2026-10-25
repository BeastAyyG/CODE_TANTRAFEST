import { PageHeader } from "@/components/ui";
import { GraphView } from "./GraphView";

export const metadata = { title: "Wallet graph" };

export default function GraphPage() {
  return (
    <>
      <PageHeader
        eyebrow="Conflict of interest · wallet graph"
        title={
          <>
            The disclosure is incomplete.
            <br />
            <span className="text-signal">The funding path is not.</span>
          </>
        }
        description="A disclosed proposer wallet funds an undisclosed operations wallet, which funds the GrowthLabs deployer 19 days before the proposal. The graph is a risk signal with transactions attached — not a conclusion of wrongdoing."
        meta={
          <>
            <span className="chip border-danger/30 text-danger">simulated data</span>
            <span className="chip">noisy-OR · 4 links</span>
          </>
        }
        actions={
          <>
            <a href="#challenge" className="btn">
              Challenge payload
            </a>
            <a href="#links" className="btn">
              Link evidence
            </a>
          </>
        }
      />
      <GraphView />
    </>
  );
}
