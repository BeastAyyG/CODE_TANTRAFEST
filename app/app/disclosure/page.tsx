"use client";

import { WalletGraph } from "@/components/WalletGraph";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useProposal } from "@/lib/proposal-context";

export default function DisclosurePage() {
  const { proposal } = useProposal();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Disclosure & graph"
        title="Conflict-of-interest graph"
        description="Simulated wallet links and noisy-OR risk scoring. The interactive canvas lands in the next build; this page renders the container."
        actions={
          <StatusBadge tone="info">proposal {proposal.id}</StatusBadge>
        }
      />
      <WalletGraph proposalId={proposal.id} />
    </div>
  );
}
