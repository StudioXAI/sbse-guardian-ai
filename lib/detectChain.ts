/* ─────────────────────────────────────────────────────────────
   Universal Chain Detection Engine — Batch 5D fix

   The old logic was a race: fire 5 probes in parallel, first hit wins.
   This broke for tokens like SHIB: the SHIB address on Base has unrelated
   bytecode (different contract), but Base's explorer responded faster
   than Ethereum's, so the race picked Base as the winner.

   New logic: probe all tier-1 chains in parallel, but pick the hit with
   the LOWEST tier + lowest CHAIN_REGISTRY index. This means Ethereum
   always beats Base when both have bytecode. Only fall through to tier 2
   if nothing in tier 1 responded.
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
): Promise<ChainEntry | null> {
  try {
    const apiKey = getExplorerApiKey(chain);
    if (!chain.explorerApi) return null;

    const url =
      `${chain.explorerApi}?chainid=${chain.chainIdNum}` +
      `&module=proxy&action=eth_getCode` +
      `&address=${contractAddress}&tag=latest&apikey=${apiKey}`;

    const data = await fetchJson<{ result?: string; error?: unknown }>(url, 7_000);
    const code = data?.result;

    if (!code || typeof code !== "string" || code.length < 4 || code === "0x") {
      return null;
    }

    return chain;
  } catch {
    debug("Explorer probe failed:", chain.name);
    return null;
  }
}

async function probeTier(
  tierChains: ChainEntry[],
  contractAddress: string,
): Promise<ChainEntry[]> {
  const results = await Promise.all(
    tierChains.map((c) => probeExplorer(c, contractAddress)),
  );
  return results.filter((r): r is ChainEntry => r !== null);
}

export async function detectChain(
  contractAddress: string,
): Promise<DetectedChain> {
  const tiers = new Map<number, ChainEntry[]>();
  CHAIN_REGISTRY.forEach((chain) => {
    if (!tiers.has(chain.tier)) tiers.set(chain.tier, []);
    tiers.get(chain.tier)!.push(chain);
  });

  const sortedTiers = [...tiers.keys()].sort((a, b) => a - b);

  for (const tier of sortedTiers) {
    const tierChains = tiers.get(tier)!;
    const hits = await probeTier(tierChains, contractAddress);
    if (hits.length > 0) {
      const winner = hits[0];
      if (hits.length > 1) {
        debug(
          `Contract found on ${hits.length} chains in tier ${tier}: ${hits
            .map((c) => c.name)
            .join(", ")}. Picking ${winner.name} (highest priority).`,
        );
      }
      return {
        ...toChainInfo(winner, "Explorer eth_getCode"),
        found: true,
      };
    }
  }

  return {
    ...toChainInfo(CHAIN_REGISTRY[0], "Fallback"),
    found: false,
  };
}
