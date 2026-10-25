import Link from "next/link";
import { Panel, SectionHeader } from "@/components/ui";

const TOUR = [
  { href: "/trail", label: "Decision Trail", note: "The four stages and the blocked verdict" },
  { href: "/intent", label: "Intent review", note: "Claims, ambiguities, live hashes" },
  { href: "/timeline", label: "Version chain", note: "Three versions and evidence proofs" },
  { href: "/graph", label: "Wallet graph", note: "Disclosed vs discovered, noisy-OR risk" },
  { href: "/vote", label: "Informed vote", note: "Brief, ballot and receipt" },
  { href: "/arena", label: "Red-team Arena", note: "Eleven scenarios and reports" },
  { href: "/scorecard", label: "Scorecard", note: "25 pass, 0 fail, 9 test required" },
  { href: "/present", label: "Presentation", note: "Seven-slide offline deck" },
];

const DOCS = [
  {
    href: "https://github.com/BeastAyyG/CODE_TANTRAFEST/blob/main/console/docs/PROJECT-STATUS.md",
    label: "Project status",
    note: "What is real, simulated and blocked",
  },
  {
    href: "https://github.com/BeastAyyG/CODE_TANTRAFEST/blob/main/console/docs/demo-script.md",
    label: "Demo script",
    note: "The five-minute judge path",
  },
  {
    href: "https://github.com/BeastAyyG/CODE_TANTRAFEST/blob/main/console/docs/audit-2026-10-25.md",
    label: "Audit",
    note: "What was claimed vs proven",
  },
  {
    href: "https://github.com/BeastAyyG/CODE_TANTRAFEST/blob/main/console/docs/person-a-handoff.md",
    label: "Person A handoff",
    note: "Contracts, ABIs and error-map swap points",
  },
  {
    href: "https://github.com/BeastAyyG/CODE_TANTRAFEST/blob/main/MUSE_NEXT.md",
    label: "Next steps",
    note: "The integrator's current queue",
  },
];

export default function DocsPage() {
  return (
    <div className="space-y-9">
      <section>
        <div className="mono-label text-danger">Docs · Aegis IntentLock</div>
        <h1 className="mt-3 max-w-4xl text-balance text-[34px] font-semibold leading-[1.02] tracking-[-0.035em] text-body sm:text-[44px]">
          Everything the demo claims,
          <br />
          and where the proof lives.
        </h1>
        <p className="mt-4 max-w-3xl text-[14px] leading-relaxed text-dim">
          The editorial pages carry the story. These are the operating notes: how to run
          the chain, what is simulated, and which properties are still waiting on the
          Solidity executor.
        </p>
      </section>

      <section>
        <SectionHeader
          eyebrow="Tour"
          title="The screens"
          description="Start with the trail, then open the evidence behind each stage."
        />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {TOUR.map((item) => (
            <Link key={item.href} href={item.href} className="panel group p-4 transition-colors hover:border-edge2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-medium text-body">{item.label}</span>
                <span className="font-mono text-[10px] text-faint group-hover:text-danger">→</span>
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-dim">{item.note}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          <SectionHeader
            eyebrow="Live chain"
            title="How to run the backend"
            description="The live screens read a local Hardhat node. Nothing is deployed to a public network."
          />
          <Panel className="p-5">
            <pre className="overflow-x-auto font-mono text-[11px] leading-relaxed text-steel">
{`# terminal 1
npx hardhat node

# terminal 2
npm run deploy
npm run seed

# terminal 3
cd console
npm run dev`}
            </pre>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/live" className="btn btn-sm btn-primary">
                Open live network
              </Link>
              <Link href="/api/status" prefetch={false} className="btn btn-sm">
                /api/status
              </Link>
              <Link href="/api/live/proposals" prefetch={false} className="btn btn-sm">
                /api/live/proposals
              </Link>
            </div>
          </Panel>
        </div>

        <div>
          <SectionHeader
            eyebrow="Reading"
            title="Written docs"
            description="The long-form material lives in the public repository."
          />
          <Panel className="p-5">
            <div className="space-y-3">
              {DOCS.map((doc) => (
                <a
                  key={doc.href}
                  href={doc.href}
                  target="_blank"
                  rel="noreferrer"
                  className="block border-b border-edge/60 pb-3 last:border-0 last:pb-0"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[12.5px] font-medium text-body">{doc.label}</span>
                    <span className="font-mono text-[9px] text-faint">↗</span>
                  </div>
                  <p className="mt-0.5 text-[10.5px] leading-relaxed text-faint">
                    {doc.note}
                  </p>
                </a>
              ))}
            </div>
          </Panel>
        </div>
      </section>

      <section className="panel p-5">
        <div className="mono-label">Honesty note</div>
        <p className="mt-2 max-w-4xl text-[12.5px] leading-relaxed text-dim">
          The AIP-042 trail, intent review, wallet graph and arena use a TypeScript
          reference model over labelled fixtures. The live section reads real contracts on
          the local Hardhat node. Do not describe the reference model as an on-chain
          guarantee; the nine scorecard properties marked TEST_REQUIRED are still waiting
          for the Solidity executor.
        </p>
      </section>
    </div>
  );
}
