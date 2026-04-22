/* ─────────────────────────────────────────────────────────────
   Universal Chain Detection Engine
   Strategy:
   - Etherscan V2 supports 35 mainnets via one unified endpoint.
   - Rather than fire 35 parallel requests (rate-limit suicide on
     free tier), we run a concurrency-limited worker pool that
     scans in priority order (tier 1 → 2 → 3) and stops on the
     first hit.
   - RPC fallback runs only if no explorer returns a match.
   ───────────────────────────────────────────────────────────── */

import {
  CHAIN_REGISTRY,
  getExplorerApiKey,
  type ChainEntry,
} from "./chainRegistry";
import { fetchJson, rpcCall, type ChainInfo } from "./fetchHelpers";
import { RPC_TIMEOUT_MS, debug } from "./constants";

export interface DetectedChain extends ChainInfo {
  found: boolean;
}

/** How many explorer probes to run in parallel. Free-tier safe (5/sec). */
const MAX_CONCURRENCY = 5;

const DEFAULT_RPC = "https://eth.llamarpc.com";

function toChainInfo(chain: ChainEntry, scannerType: string): ChainInfo {
  return {
    chainId: chain.id,
    chainName: chain.name,
    chainIdNum: chain.chainIdNum,
    rpc: chain.rpc || DEFAULT_RPC,
    explorerApi: chain.explorerApi,
    explorerApiKey: getExplorerApiKey(chain),
    symbol: chain.symbol,
    scannerType,
  };
}

async function probeExplorer(
  chain: ChainEntry,
  contractAddress: string,
): Promise<ChainInfo | null> {
  try {
    const apiKey = getExplorerApiKey(chain);
    if (!chain.explorerApi) return null;

    const url =
      `${chain.explorerApi}?chainid=${chain.chainIdNum}` +
      `&module=contract&action=getsourcecode` +
      `&address=${contractAddress}&apikey=${apiKey}`;

    const data = await fetchJson<any>(url, 8_000);
    const result = data?.result?.[0];

    const hasContract =
      !!result &&
      (!!result.ContractName || !!result.SourceCode || !!result.ABI) &&
      result.ABI !== "Contract source code not verified" &&
      result.ABI !== "Invalid Address format";

    if (!hasContract) return null;
    return toChainInfo(chain, "Explorer API");
  } catch {
    debug("Explorer probe failed:", chain.name);
    return null;
  }
}

async function probeRpc(
  chain: ChainEntry,
  contractAddress: string,
): Promise<ChainInfo | null> {
  try {
    if (!chain.rpc) return null;
    const code = await rpcCall<string>(
      chain.rpc,
      "eth_getCode",
      [contractAddress, "latest"],
      RPC_TIMEOUT_MS,
    );
    if (!code || code === "0x" || code.length <= 10) return null;
    return toChainInfo(chain, "RPC Detection");
  } catch {
    debug("RPC probe failed:", chain.name);
    return null;
  }
}

/**
 * Concurrency-limited worker pool.
 * Processes `items` in order, up to `concurrency` at a time.
 * Returns as soon as any worker finds a match; remaining work is abandoned.
 */
async function raceWithLimit<T>(
  items: ChainEntry[],
  probe: (c: ChainEntry) => Promise<T | null>,
  concurrency: number,
): Promise<T | null> {
  const queue = [...items];
  let winner: T | null = null;

  async function worker(): Promise<void> {
    while (queue.length > 0 && winner === null) {
      const item = queue.shift();
      if (!item) return;
      const result = await probe(item);
      if (result !== null && winner === null) {
        winner = result;
        return;
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () =>
    worker(),
  );
  await Promise.all(workers);
  return winner;
}

export async function detectChain(
  contractAddress: string,
): Promise<DetectedChain> {
  /* ── Explorer detection (tiered) ── */
  /* Sort by tier so popular chains get checked first. */
  const sorted = [...CHAIN_REGISTRY].sort((a, b) => a.tier - b.tier);

  const explorerHit = await raceWithLimit(
    sorted,
    (c) => probeExplorer(c, contractAddress),
    MAX_CONCURRENCY,
  );
  if (explorerHit) return { ...explorerHit, found: true };

  /* ── RPC fallback (tier 1 only — only popular chains have reliable public RPCs) ── */
  const tier1 = CHAIN_REGISTRY.filter((c) => c.tier === 1 && c.rpc);
  const rpcHit = await raceWithLimit(
    tier1,
    (c) => probeRpc(c, contractAddress),
    3,
  );
  if (rpcHit) return { ...rpcHit, found: true };

  /* ── Not found anywhere ── */
  return { ...toChainInfo(CHAIN_REGISTRY[0], "Fallback"), found: false };
}
