"use client";

import { DecisionTrail } from "@/components/DecisionTrail";
import { ViolationExplainer } from "@/components/ViolationExplainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useProposal } from "@/lib/proposal-context";

export default function DecisionTrailPage() {
  const { proposal } = useProposal();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Decision trail"
        title={proposal.title}
        description="Claims → COI → Voting → Execution. The first three stages inform; execution is a binary on-chain gate."
        actions={
          <StatusBadge tone="info">proposal {proposal.id}</StatusBadge>
        }
      />

      <DecisionTrail proposalId={proposal.id} />

      <section>
        <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          Violation explainer
        </h2>
        <ViolationExplainer scenarioId={proposal.scenarioId} />
      </section>
    </div>
  );
}
