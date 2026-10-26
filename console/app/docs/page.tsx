import Link from "next/link";

const TOUR = [
  { href: "/trail", label: "Decision trail", note: "the blocked record" },
  { href: "/intent", label: "Intent review", note: "claims and unresolved questions" },
  { href: "/timeline", label: "Version history", note: "three versions and evidence" },
  { href: "/graph", label: "Disclosure graph", note: "wallets and links" },
  { href: "/vote", label: "Vote record", note: "brief, tally, ballot" },
  { href: "/arena", label: "Red-team arena", note: "eleven scenarios" },
  { href: "/scorecard", label: "Scorecard", note: "what is proven" },
  { href: "/live", label: "Live chain", note: "local Hardhat reads" },
  { href: "/present", label: "Presentation", note: "seven-slide deck" },
];

const DOCS = [
  {
    href: "https://github.com/BeastAyyG/CODE_TANTRAFEST/blob/main/console/docs/PROJECT-STATUS.md",
    label: "Project status",
    note: "what is real, simulated and blocked",
  },
  {
    href: "https://github.com/BeastAyyG/CODE_TANTRAFEST/blob/main/console/docs/demo-script.md",
    label: "Demo script",
    note: "the five-minute judge path",
  },
  {
    href: "https://github.com/BeastAyyG/CODE_TANTRAFEST/blob/main/console/docs/audit-2026-10-25.md",
    label: "Audit",
    note: "what was claimed versus proven",
  },
  {
    href: "https://github.com/BeastAyyG/CODE_TANTRAFEST/blob/main/console/docs/person-a-handoff.md",
    label: "Person A handoff",
    note: "contracts, ABIs and error-map swap points",
  },
  {
    href: "https://github.com/BeastAyyG/CODE_TANTRAFEST/blob/main/MUSE_NEXT.md",
    label: "Next steps",
    note: "the integrator's queue",
  },
];

export default function DocsPage() {
  return (
    <div className="doc-page">
      <aside className="doc-margin">
        <div className="doc-folio">Documentation</div>
        <div className="doc-folio mt-1">26 Oct 2026</div>
        <div className="mt-7 border-t border-edge pt-3">
          <div className="doc-note">9 screens</div>
          <div className="doc-note mt-1">Local chain</div>
          <div className="doc-note mt-1">Reference model labelled</div>
        </div>
      </aside>

      <div className="doc-body">
        <span className="doc-folio">Documentation, Aegis IntentLock</span>
        <h1 className="doc-title mt-2 text-body">Operating notes</h1>
        <p className="doc-deck mt-4">
          What the demo claims, how to run the local chain, and where the proof
          lives. The editorial Atlas and AIP-042 report are at{" "}
          <Link href="/" className="underline decoration-danger/40 underline-offset-2">
            /
          </Link>{" "}
          and{" "}
          <Link href="/report" className="underline decoration-danger/40 underline-offset-2">
            /report
          </Link>
          .
        </p>

        <section className="doc-section">
          <div className="doc-section-head">
            <h2 className="doc-section-title">Contents</h2>
            <span className="doc-folio">{TOUR.length} screens</span>
          </div>
          <table className="doc-ledger">
            <tbody>
              {TOUR.map((item) => (
                <tr key={item.href}>
                  <td className="w-[200px]">
                    <Link
                      href={item.href}
                      className="font-medium text-body hover:text-danger"
                    >
                      {item.label}
                    </Link>
                  </td>
                  <td className="text-dim">{item.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="doc-section">
          <div className="doc-section-head">
            <h2 className="doc-section-title">Run the local chain</h2>
            <span className="doc-folio">three terminals</span>
          </div>
          <pre className="border-l-2 border-edge pl-4 font-mono text-[11px] leading-relaxed text-steel">
{`# terminal 1
npx hardhat node

# terminal 2
npm run deploy
npm run seed

# terminal 3
cd console
npm run dev`}
          </pre>
          <p className="doc-note mt-3">
            The live pages read the node at 127.0.0.1:8545. After reseeding,
            restart the dev server so it reloads the deployment manifest.
          </p>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-[12px]">
            <Link href="/live" className="underline decoration-danger/40 underline-offset-2 hover:text-danger">
              Open the live chain
            </Link>
            <Link href="/api/status" prefetch={false} className="underline decoration-danger/40 underline-offset-2 hover:text-danger">
              /api/status
            </Link>
            <Link href="/api/live/proposals" prefetch={false} className="underline decoration-danger/40 underline-offset-2 hover:text-danger">
              /api/live/proposals
            </Link>
          </div>
        </section>

        <section className="doc-section">
          <div className="doc-section-head">
            <h2 className="doc-section-title">Written docs</h2>
            <span className="doc-folio">public repository</span>
          </div>
          <table className="doc-ledger">
            <tbody>
              {DOCS.map((doc) => (
                <tr key={doc.href}>
                  <td className="w-[200px]">
                    <a
                      href={doc.href}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-body underline decoration-danger/30 underline-offset-2 hover:text-danger"
                    >
                      {doc.label}
                    </a>
                  </td>
                  <td className="text-dim">{doc.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="doc-section">
          <h2 className="doc-section-title">Honesty note</h2>
          <p className="mt-2 max-w-[62ch] text-[12.5px] leading-relaxed text-dim">
            The AIP-042 trail, intent review, wallet graph and arena use a
            TypeScript reference model over labelled fixtures. The live section
            reads real contracts on the local Hardhat node. Do not describe the
            reference model as an on-chain guarantee; the nine scorecard
            properties marked TEST_REQUIRED are still waiting for the Solidity
            executor.
          </p>
        </section>
      </div>
    </div>
  );
}
