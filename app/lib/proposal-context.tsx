"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { Proposal } from "./types";

interface ProposalContextValue {
  proposals: Proposal[];
  proposal: Proposal;
  setProposalId: (id: string) => void;
  selectProposal: (proposal: Proposal) => void;
}

const ProposalContext = createContext<ProposalContextValue | null>(null);

export function ProposalProvider({
  proposals,
  children,
}: {
  proposals: Proposal[];
  children: React.ReactNode;
}) {
  const [id, setId] = useState(proposals[0]?.id ?? "");
  const [liveProposals, setLiveProposals] = useState<Proposal[]>([]);

  const allProposals = useMemo(() => {
    const merged = [...proposals];
    for (const candidate of liveProposals) {
      if (!merged.some((proposal) => proposal.id === candidate.id)) {
        merged.push(candidate);
      }
    }
    return merged;
  }, [proposals, liveProposals]);

  const selectProposal = useCallback((proposal: Proposal) => {
    setLiveProposals((current) =>
      current.some((item) => item.id === proposal.id)
        ? current
        : [...current, proposal]
    );
    setId(proposal.id);
  }, []);

  const value = useMemo<ProposalContextValue | null>(() => {
    const proposal = allProposals.find((item) => item.id === id) ?? allProposals[0];
    if (!proposal) return null;
    return {
      proposals: allProposals,
      proposal,
      setProposalId: setId,
      selectProposal,
    };
  }, [allProposals, id, selectProposal]);

  if (!value) return <>{children}</>;
  return (
    <ProposalContext.Provider value={value}>
      {children}
    </ProposalContext.Provider>
  );
}

export function useProposal(): ProposalContextValue {
  const context = useContext(ProposalContext);
  if (!context) {
    throw new Error("useProposal must be used inside a ProposalProvider");
  }
  return context;
}
