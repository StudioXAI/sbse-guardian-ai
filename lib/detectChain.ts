/* ─────────────────────────────────────────────────────────────
   Universal Chain Detection Engine
   Strategy:
   - Use Etherscan V2's `eth_getCode` proxy endpoint instead of
     `getsourcecode`. `eth_getCode` returns only the deployed
     bytecode length indicator — tiny response, uniform across
     all chains regardless of source verification, and far less
     likely to trigger 502s under burst load.
   - Tiered scan: tier 1 (popular) first, then 2, then 3.
   - Concurrency capped at 5 to stay under free-tier limits.
   - First match wins; remaining probes are abandoned.
   ───────────────────────────────────────────────────────────── */

import {
  CHAIN_REGISTRY,
  getExplorerApiKey,
  type ChainEntry,
} from "./chainRegistry";
import { fetchJson, type ChainInfo } from "./fetchHelpers";
import { debug } from "./constants";

export interface DetectedChain extends ChainInfo {
  found: boolean;
}

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

/**
 * Check if a contract exists on a specific chain using the
 * explorer's eth_getCode proxy endpoint. Returns ChainInfo on
 * match, null on miss, null on error.
 */
async function probeExplorer(
  chain: ChainEntry,
  contractAddress: string,
): Promise<ChainInfo | null> {
  try {
    const apiKey = getExplorerApiKey(chain);
    if (!chain.explorerApi) return null;

    const url =
      `${chain.explorerApi}?chainid=${chain.chainIdNum}` +
      `&module=proxy&action=eth_getCode` +
      `&address=${contractAddress}&tag=latest&apikey=${apiKey}`;

    const data = await fetchJson<{ result?: string; error?: unknown }>(url, 7_000);
    const code = data?.result;

    // `0x` or short => no contract at this address on this chain.
    // Any non-trivial bytecode => contract exists.
    if (!code || typeof code !== "string" || code.length < 4 || code === "0x") {
      return null;
    }

    return toChainInfo(chain, "Explorer eth_getCode");
  } catch {
    debug("Explorer probe failed:", chain.name);
    return null;
  }
}

/**
 * Concurrency-limited race.
 * Processes items in `items` order, up to `concurrency` in flight.
 * Resolves with the first non-null result; remaining probes are abandoned.
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

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return winner;
}

export async function detectChain(
  contractAddress: string,
): Promise<DetectedChain> {
  /* Sort by tier so popular chains get checked first. */
  const sorted = [...CHAIN_REGISTRY].sort((a, b) => a.tier - b.tier);

  const hit = await raceWithLimit(
    sorted,
    (c) => probeExplorer(c, contractAddress),
    MAX_CONCURRENCY,
  );

  if (hit) return { ...hit, found: true };

  return { ...toChainInfo(CHAIN_REGISTRY[0], "Fallback"), found: false };
}
