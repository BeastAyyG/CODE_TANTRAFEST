/**
 * app/app/status/page.tsx
 * Diagnostics: RPC reachable, chain id, contract code presence, scorecard freshness.
 */
import { getChainDiagnostics } from "../../lib/chain";
import { repoRoot } from "../../lib/backend";
import path from "node:path";
import fs from "node:fs";

export const dynamic = "force-dynamic";

async function getScorecardFreshMs(): Promise<number | null> {
  try {
    const sc = path.join(repoRoot(), "packages", "shared", "scorecard.json");
    if (!fs.existsSync(sc)) return null;
    return Date.now() - fs.statSync(sc).mtimeMs;
  } catch {
    return null;
  }
}

function Badge({ ok, label }: { ok: boolean; label: string }) {
  const color = ok ? "bg-green-600" : "bg-red-600";
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-white text-xs font-mono ${color}`}>
      {label}
    </span>
  );
}

export default async function StatusPage() {
  const [diag, scorecardFreshMs] = await Promise.all([
    getChainDiagnostics(),
    getScorecardFreshMs(),
  ]);

  const scorecardAge = scorecardFreshMs !== null
    ? `${Math.round(scorecardFreshMs / 1000)}s ago`
    : "not found";

  return (
    <main style={{ fontFamily: "monospace", padding: "2rem", maxWidth: 780 }}>
      <h1 style={{ fontSize: "1.4rem", marginBottom: "1.5rem" }}>
        AegisDAO — Chain Diagnostics
      </h1>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2>RPC</h2>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <tbody>
            <tr>
              <td style={{ padding: "4px 12px 4px 0" }}>URL</td>
              <td><code>{diag.rpcUrl}</code></td>
            </tr>
            <tr>
              <td style={{ padding: "4px 12px 4px 0" }}>Reachable</td>
              <td>
                <Badge ok={diag.rpcReachable} label={diag.rpcReachable ? "YES" : "NO"} />
              </td>
            </tr>
            <tr>
              <td style={{ padding: "4px 12px 4px 0" }}>Chain ID (live)</td>
              <td><code>{diag.chainId ?? "—"}</code></td>
            </tr>
            <tr>
              <td style={{ padding: "4px 12px 4px 0" }}>Chain ID (manifest)</td>
              <td><code>{diag.manifestChainId}</code></td>
            </tr>
            <tr>
              <td style={{ padding: "4px 12px 4px 0" }}>Match</td>
              <td>
                <Badge ok={diag.chainIdMatch} label={diag.chainIdMatch ? "OK" : "MISMATCH"} />
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2>Contracts (from deployments/local.json)</h2>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", paddingRight: 16 }}>Contract</th>
              <th style={{ textAlign: "left", paddingRight: 16 }}>Address</th>
              <th style={{ textAlign: "left" }}>Code</th>
            </tr>
          </thead>
          <tbody>
            {diag.contracts.map((c) => (
              <tr key={c.name}>
                <td style={{ paddingRight: 16, paddingBottom: 4 }}>{c.name}</td>
                <td style={{ paddingRight: 16 }}><code style={{ fontSize: "0.78rem" }}>{c.address}</code></td>
                <td>
                  <Badge ok={c.hasCode} label={c.hasCode ? "DEPLOYED" : "EMPTY"} />
                </td>
              </tr>
            ))}
            {diag.contracts.length === 0 && (
              <tr>
                <td colSpan={3} style={{ color: "red" }}>
                  deployments/local.json not found or empty.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Scorecard</h2>
        <p>Last updated: <code>{scorecardAge}</code></p>
      </section>
    </main>
  );
}