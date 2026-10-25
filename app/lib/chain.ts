/**
 * app/lib/chain.ts
 *
 * Read-only ethers v6 provider + typed contract instances loaded from
 * deployments/local.json at the repo root.
 *
 * Rules:
 *  - Fail loudly (never silently swallow) if RPC or contract addresses are missing.
 *  - All contract state enums mirrored from Solidity source — no guessed numbers.
 *  - Server-side only (Node); never imported by client components directly.
 */

import { ethers } from "ethers";
import fs from "node:fs";
import path from "node:path";
import { repoRoot } from "./backend";

// ─────────────────────────────────────────────────────────────────────────────
// ProposalState enum — mirrors IntentLockExecutor.sol exactly
// ─────────────────────────────────────────────────────────────────────────────
export const ProposalState = {
  Empty:     0,   // not queued
  Queued:    1,   // waiting for timelock
  Executed:  2,   // successfully executed
  Halted:    3,   // cancelled by guardian
  Cancelled: 4,   // cancelled by governor
} as const;
export type ProposalStateValue = (typeof ProposalState)[keyof typeof ProposalState];

// GovProposalState — mirrors IntentGovernor.sol exactly
export const GovProposalState = {
  Draft:              0,
  DisclosurePending:  1,
  VotingOpen:         2,
  Defeated:           3,
  Passed:             4,
  Queued:             5,
  Executed:           6,
  Halted:             7,
  Cancelled:          8,
} as const;
export type GovProposalStateValue = (typeof GovProposalState)[keyof typeof GovProposalState];

export const GOV_STATE_LABEL: Record<number, string> = {
  0: "Draft",
  1: "DisclosurePending",
  2: "VotingOpen",
  3: "Defeated",
  4: "Passed",
  5: "Queued",
  6: "Executed",
  7: "Halted",
  8: "Cancelled",
};

// ─────────────────────────────────────────────────────────────────────────────
// Deployment manifest loader
// ─────────────────────────────────────────────────────────────────────────────

interface ContractEntry {
  address: string;
  abi: ethers.InterfaceAbi;
}

interface Manifest {
  network: string;
  chainId: number;
  contracts: Record<string, ContractEntry>;
}

let _manifest: Manifest | null = null;
function loadManifest(): Manifest {
  if (_manifest) return _manifest;
  const manifestPath = path.join(repoRoot(), "deployments", "local.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(
      `deployments/local.json not found at ${manifestPath}. ` +
      `Run \`npm run deploy\` (with hardhat node running) first.`
    );
  }
  _manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Manifest;
  return _manifest;
}

function contractEntry(name: string): ContractEntry {
  const m = loadManifest();
  const entry = m.contracts[name];
  if (!entry?.address || entry.address === ethers.ZeroAddress) {
    throw new Error(
      `Contract "${name}" has no deployed address in deployments/local.json. ` +
      `Re-deploy with \`npm run deploy\`.`
    );
  }
  return entry;
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider (read-only JsonRpc)
// ─────────────────────────────────────────────────────────────────────────────

let _provider: ethers.JsonRpcProvider | null = null;
export function getProvider(): ethers.JsonRpcProvider {
  if (_provider) return _provider;
  const rpcUrl =
    process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545";
  _provider = new ethers.JsonRpcProvider(rpcUrl);
  return _provider;
}

// ─────────────────────────────────────────────────────────────────────────────
// Signer (Hardhat account selector — dev only)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return a JsonRpcSigner for Hardhat account at index `accountIndex`.
 * Works only against a local Hardhat node (accounts are pre-funded).
 */
export async function getDevSigner(
  accountIndex = 0
): Promise<ethers.JsonRpcSigner> {
  const provider = getProvider();
  const accounts = await provider.send("eth_accounts", []);
  if (!accounts[accountIndex]) {
    throw new Error(
      `No Hardhat account at index ${accountIndex}. Is the node running?`
    );
  }
  return provider.getSigner(accounts[accountIndex] as string);
}

// ─────────────────────────────────────────────────────────────────────────────
// Contract instances (read-only)
// ─────────────────────────────────────────────────────────────────────────────

export function getProposalRegistry(): ethers.Contract {
  const { address, abi } = contractEntry("ProposalRegistry");
  return new ethers.Contract(address, abi, getProvider());
}

export function getIntentGovernor(): ethers.Contract {
  const { address, abi } = contractEntry("IntentGovernor");
  return new ethers.Contract(address, abi, getProvider());
}

export function getDisclosureRegistry(): ethers.Contract {
  const { address, abi } = contractEntry("DisclosureRegistry");
  return new ethers.Contract(address, abi, getProvider());
}

export function getIntentLockExecutor(): ethers.Contract {
  const { address, abi } = contractEntry("IntentLockExecutor");
  return new ethers.Contract(address, abi, getProvider());
}

// ─────────────────────────────────────────────────────────────────────────────
// Diagnostics helpers
// ─────────────────────────────────────────────────────────────────────────────

export interface ContractDiagnostic {
  name: string;
  address: string;
  hasCode: boolean;
}

export interface ChainDiagnostics {
  rpcReachable: boolean;
  chainId: number | null;
  chainIdMatch: boolean;
  contracts: ContractDiagnostic[];
  manifestChainId: number;
  rpcUrl: string;
}

export async function getChainDiagnostics(): Promise<ChainDiagnostics> {
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545";
  let rpcReachable = false;
  let chainId: number | null = null;

  try {
    const provider = getProvider();
    const network = await provider.getNetwork();
    chainId = Number(network.chainId);
    rpcReachable = true;
  } catch {
    // fall through — rpcReachable stays false
  }

  let manifest: Manifest | null = null;
  let contracts: ContractDiagnostic[] = [];
  let manifestChainId = 0;

  try {
    manifest = loadManifest();
    manifestChainId = manifest.chainId;
    if (rpcReachable) {
      contracts = await Promise.all(
        Object.entries(manifest.contracts).map(async ([name, entry]) => {
          let hasCode = false;
          try {
            const code = await getProvider().getCode(entry.address);
            hasCode = code !== "0x";
          } catch {
            // leave false
          }
          return { name, address: entry.address, hasCode };
        })
      );
    } else {
      contracts = Object.entries(manifest.contracts).map(([name, entry]) => ({
        name,
        address: entry.address,
        hasCode: false,
      }));
    }
  } catch {
    // manifest missing
  }

  return {
    rpcReachable,
    chainId,
    chainIdMatch: chainId !== null && chainId === manifestChainId,
    contracts,
    manifestChainId,
    rpcUrl,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Error decoding
// ─────────────────────────────────────────────────────────────────────────────

export interface DecodedError {
  selector: string;
  title: string;
  explanation: string;
  signature: string;
}

type ErrorCatalog = Record<string, { title: string; explanation: string; signature: string; contract: string }>;

let _errorCatalog: ErrorCatalog | null = null;
function errorCatalog(): ErrorCatalog {
  if (_errorCatalog) return _errorCatalog;
  try {
    const errPath = path.join(repoRoot(), "app", "lib", "mocks", "errors.json");
    _errorCatalog = JSON.parse(fs.readFileSync(errPath, "utf8")) as ErrorCatalog;
  } catch {
    _errorCatalog = {};
  }
  return _errorCatalog;
}

/**
 * Decode a revert data hex string to a human-readable error.
 * Falls back to "UNKNOWN ERROR 0x..." — never swallows.
 */
export function decodeRevert(revertData: string): DecodedError {
  const selector = revertData.slice(0, 10).toLowerCase();
  const catalog = errorCatalog();
  const known = catalog[selector];
  if (known) {
    return {
      selector,
      title: known.title,
      explanation: known.explanation,
      signature: known.signature,
    };
  }

  // Try executor ABI error fragments
  try {
    const { abi } = contractEntry("IntentLockExecutor");
    const iface = new ethers.Interface(abi);
    const parsed = iface.parseError(revertData);
    if (parsed) {
      return {
        selector,
        title: parsed.name,
        explanation: `Args: ${parsed.args.join(", ")}`,
        signature: parsed.signature,
      };
    }
  } catch {
    // ignore
  }

  return {
    selector,
    title: `UNKNOWN ERROR ${selector}`,
    explanation: `Raw revert data: ${revertData}`,
    signature: selector,
  };
}
