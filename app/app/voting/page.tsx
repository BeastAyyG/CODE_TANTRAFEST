"use client";

import { VotingPanel } from "@/components/VotingPanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useProposal } from "@/lib/proposal-context";

export default function VotingPage() {
  const { proposal } = useProposal();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Informed consent"
        title="Voting"
        description="Votes bind to the execution commitment. Brief acknowledgments feed the informed-vote ratio."
        actions={<StatusBadge tone="info">gov {proposal.govId}</StatusBadge>}
      />
      <VotingPanel govId={proposal.govId} />
    </div>
  );
}
