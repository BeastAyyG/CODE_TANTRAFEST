import { PageHeader } from "@/components/ui";
import { IntentReview } from "./IntentReview";

export const metadata = { title: "Intent review" };

export default function IntentPage() {
  return (
    <>
      <PageHeader
        eyebrow="AI intent drafting · AIP-042"
        title={
          <>
            Every claim has a source.
            <br />
            <span className="text-signal">Two questions still change the rules.</span>
          </>
        }
        description="The extractor proposes rules from the proposal text. A strict validator rejects any claim without a document span. The reviewer resolves each ambiguity; the intent hash and the treasury brief update live."
        meta={
          <>
            <span className="chip border-signal/30 text-signal">pre-baked extraction · validator live</span>
            <span className="chip">no LLM call at demo time</span>
          </>
        }
        actions={
          <>
            <a href="#claims" className="btn">
              Claims
            </a>
            <a href="#review" className="btn">
              Resolve ambiguities
            </a>
          </>
        }
      />
      <IntentReview />
    </>
  );
}
