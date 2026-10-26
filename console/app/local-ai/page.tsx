import Link from "next/link";
import { decideRecommendation } from "../../../intelligence/recommendation";

/**
 * /local-ai — the local AI verdict, computed live by the repo's own
 * tiny model (intelligence/tiny-model.ts, 9-feature logistic regression).
 *
 * No network, no LLM, no API key: this page runs the model on the server
 * that serves the demo, on the same AIP-042 numbers the rest of the demo
 * shows. It is advisory only. It judges whether a bundle is in the
 * treasury's benefit; it does not approve or execute anything. Execution
 * is decided by the IntentLock executor (see /arena).
 *
 * Two presets, same proposal:
 * - voted: the three-call bundle the vote actually passed.
 * - upgrade: the hidden upgradeTo() call that was queued instead.
 */

export const dynamic = "force-dynamic";

const GROWTHLABS = "0x2DFCD12F1b34DA6a6E87840b1c3eFCF391b9bC15";
const GUILD = "0x45013B78dbF0c800f418D40C2995A1880aaBeB64";
const PROXY = "0xC4F32e9eb19Bd57cC6b2ca285b24eE8b7809F031";

const PRESETS = {
  voted: {
    user: "AIP-042 proposer",
    text: `Transfer 200,000 USDC to ${GROWTHLABS} (GrowthLabs Multisig) and 50,000 USDC to ${GUILD} (Developer Guild), and approve 5,000 USDC for TreasuryOps.`,
    amountUsdc: 250000,
    treasuryUsdc: 1200000,
    monthlyBurnUsdc: 122000,
    knownRecipients: [GROWTHLABS, GUILD],
    evidenceLinked: 1,
    coiRisk: 0.88,
    selectorAuthorized: true,
    participation: 0.78,
    informed: 0.59,
    disclosure: true,
  },
  upgrade: {
    user: "AIP-042 proposer",
    text: `Upgrade the treasury proxy ${PROXY} to a new implementation.`,
    treasuryUsdc: 1200000,
    monthlyBurnUsdc: 122000,
    knownRecipients: [GROWTHLABS, GUILD],
    evidenceLinked: 0,
    coiRisk: 0.88,
    selectorAuthorized: false,
    participation: 0,
    informed: 0,
    disclosure: false,
  },
};

type PresetName = "voted" | "upgrade";

const FEATURE_LABELS: Record<string, string> = {
  spendRatio: "share of treasury requested",
  runwayAfter: "runway left after the spend",
  recipientKnown: "recipient is on the allowlist",
  recipientUnknown: "recipient is not on the allowlist",
  evidenceLinked: "claims are backed by evidence",
  coiRisk: "conflict-of-interest risk",
  selectorAuthorized: "function selector is authorised",
  voteQuality: "vote participation x informed",
  disclosure: "disclosure is present",
};

export default async function LocalAiPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string }>;
}) {
  const params = await searchParams;
  const preset: PresetName = params.preset === "upgrade" ? "upgrade" : "voted";
  const decision = decideRecommendation(PRESETS[preset]);
  const accept = decision.decision === "ACCEPT";
  const accent = accept ? "#2f9e44" : "#e03131";

  return (
    <main
      style={{
        maxWidth: 860,
        margin: "0 auto",
        padding: "32px 20px 64px",
        fontFamily: "system-ui, sans-serif",
        color: "#e7e5e4",
      }}
    >
      <p style={{ opacity: 0.7 }}>
        <Link href="/trail">Decision Trail</Link> ·{" "}
        <Link href="/arena">Arena</Link>
      </p>
      <h1>Local AI verdict</h1>
      <p style={{ opacity: 0.8 }}>
        The tiny local model judges one question: is this bundle in the
        treasury&apos;s benefit? It runs here, on this machine. No network,
        no LLM, no API key. Advisory only: it never approves or executes
        anything.
      </p>

      <p>
        <Link
          href="/local-ai?preset=voted"
          style={{
            fontWeight: preset === "voted" ? 700 : 400,
            marginRight: 16,
          }}
        >
          Voted bundle
        </Link>
        <Link
          href="/local-ai?preset=upgrade"
          style={{ fontWeight: preset === "upgrade" ? 700 : 400 }}
        >
          Submitted upgrade
        </Link>
      </p>

      <section
        style={{
          border: `2px solid ${accent}`,
          borderRadius: 12,
          padding: "20px 24px",
          marginTop: 16,
        }}
      >
        <p style={{ fontSize: 28, fontWeight: 800, color: accent, margin: 0 }}>
          {decision.decision} · benefit {(decision.benefit * 100).toFixed(1)}%
        </p>
        <p style={{ marginTop: 12 }}>{decision.recommendation}</p>
      </section>

      <h2>Why</h2>
      <ul>
        {decision.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>

      <h2>Features</h2>
      <table cellPadding={8} style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", opacity: 0.7 }}>
            <th>Feature</th>
            <th>Value</th>
            <th>Weight</th>
            <th>Contribution</th>
          </tr>
        </thead>
        <tbody>
          {decision.contributions.map((c) => (
            <tr key={c.feature} style={{ borderTop: "1px solid #44403c" }}>
              <td>{FEATURE_LABELS[c.feature] ?? c.feature}</td>
              <td>{c.value.toFixed(3)}</td>
              <td>{c.weight.toFixed(2)}</td>
              <td>{c.contribution >= 0 ? "+" : ""}{c.contribution.toFixed(3)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p style={{ opacity: 0.7, marginTop: 24 }}>
        Same numbers as the rest of the demo: 250,000 USDC requested, 1.2M
        treasury, 122,000 monthly burn, 7/7 claims evidence-linked, 0.88 COI
        risk, 78% turnout, 59% informed. The vote passed the bundle anyway;
        the executor, not this model, is the final gate.
      </p>
    </main>
  );
}
