"use client";

import { createContext, useContext, useMemo, useState } from "react";
import type { Proposal } from "./types";

interface ProposalContextValue {
  proposals: Proposal[];
  proposal: Proposal;
  setProposalId: (id: string) => void;
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
  const value = useMemo<ProposalContextValue | null>(() => {
    const proposal = proposals.find((item) => item.id === id) ?? proposals[0];
    if (!proposal) return null;
    return { proposals, proposal, setProposalId: setId };
  }, [proposals, id]);

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
