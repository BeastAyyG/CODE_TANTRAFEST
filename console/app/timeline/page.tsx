import { PageHeader } from "@/components/ui";
import { TimelineView } from "./TimelineView";

export const metadata = { title: "Proposal timeline" };

export default function TimelinePage() {
  return (
    <>
      <PageHeader
        eyebrow="Proposal timeline · AIP-042"
        title={
          <>
            Versions are hash-chained.
            <br />
            <span className="text-signal">Documents are anchored.</span>
          </>
        }
        description="Every version commits to the previous one, to a rule set, and to an evidence root. A wording change can move the content hash without moving the rules — the commitment still moves."
        meta={
          <>
            <span className="chip">3 versions</span>
            <span className="chip">4 anchored documents</span>
            <span className="chip border-safe/30 text-safe">verify locally</span>
          </>
        }
        actions={
          <>
            <a href="#evidence" className="btn">
              Verify evidence
            </a>
            <a href="#disclosure" className="btn">
              Disclosure
            </a>
          </>
        }
      />
      <TimelineView />
    </>
  );
}
