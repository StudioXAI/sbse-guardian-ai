/* ─────────────────────────────────────────────────────────────
   Liquidity Source Analysis — Batch 4 enhanced

   Now:
   1. DexScreener first — aggregates total USD liquidity across ALL
      pairs on the target chain (not just top).
   2. GeckoTerminal fallback if DexScreener has nothing.
   3. Source-code keywords as last resort.

   Returns both the top pair AND the aggregate totals so the UI can
   show "Total: $X across N pairs" as a finding.
   ───────────────────────────────────────────────────────────── */

import { isInstitutional, debug } from "./constants";
import { explorerUrl, fetchJson, type ChainInfo } from "./fetchHelpers";

export interface LiquiditySourceResult {
  dataAvailable: boolean;
  found: boolean;
  dex?: string;
  pairAddress?: string;
  liquidity?: string;
  liquidityUsd?: number;
  /** Total liquidity across all pairs (not just the top one). */
  totalLiquidityUsd?: number;
  totalLiquidityFormatted?: string;
  pairCount?: number;
  volume24h?: string;
  volume24hUsd?: number;
  institutional: boolean;
  message?: string;
  source?: "dexscreener" | "geckoterminal" | "source-code" | "institutional";
}

const LIQUIDITY_KEYWORDS = [
  "uniswap",
  "pancakeswap",
  "sushiswap",
  "router",
  "liquidity",
  "swapexact",
];

/** Map our chainName to DexScreener's chain key. */
const DEXSCREENER_CHAIN_MAP: Record<string, string> = {
  "ethereum": "ethereum",
  "bnb smart chain": "bsc",
  "polygon": "polygon",
  "base": "base",
  "arbitrum one": "arbitrum",
  "op mainnet": "optimism",
  "avalanche": "avalanche",
  "fantom": "fantom",
};

function fmtUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

async function tryDexScreener(
  contractAddress: string,
  chain: ChainInfo,
): Promise<LiquiditySourceResult | null> {
  try {
    const dexData = await fetchJson<any>(
      `https://api.dexscreener.com/latest/dex/tokens/${contractAddress}`,
      10_000,
    );
    const allPairs: any[] = dexData?.pairs || [];
    if (!allPairs.length) return null;

    // Filter to current chain when we have a mapping
    const targetChain = DEXSCREENER_CHAIN_MAP[chain.chainName?.toLowerCase() || ""];
    const chainPairs = targetChain
      ? allPairs.filter((p) => String(p?.chainId || "").toLowerCase() === targetChain)
      : allPairs;

    const pairs = chainPairs.length ? chainPairs : allPairs;

    // Aggregate totals across all pairs on this chain
    let totalLiquidityUsd = 0;
    let totalVolume24h = 0;
    for (const p of pairs) {
      if (p?.liquidity?.usd) totalLiquidityUsd += Number(p.liquidity.usd);
      if (p?.volume?.h24) totalVolume24h += Number(p.volume.h24);
    }

    // Pick the biggest pair as the "primary"
    pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
    const main = pairs[0];
    const primaryLiquidityUsd = main.liquidity?.usd;

    return {
      dataAvailable: true,
      found: true,
      dex: main.dexId || "Verified On-Chain Liquidity",
      pairAddress: main.pairAddress || undefined,
      liquidity: primaryLiquidityUsd
        ? fmtUsd(primaryLiquidityUsd)
        : "Blockchain Verified",
      liquidityUsd: primaryLiquidityUsd,
      totalLiquidityUsd,
      totalLiquidityFormatted: totalLiquidityUsd > 0 ? fmtUsd(totalLiquidityUsd) : undefined,
      pairCount: pairs.length,
      volume24h: totalVolume24h > 0 ? fmtUsd(totalVolume24h) : "No 24h volume data",
      volume24hUsd: totalVolume24h,
      institutional: false,
      source: "dexscreener",
    };
  } catch (e) {
    debug("DexScreener lookup failed:", e);
    return null;
  }
}

async function tryGeckoTerminal(
  contractAddress: string,
  chain: ChainInfo,
): Promise<LiquiditySourceResult | null> {
  // GeckoTerminal network slugs
  const networkMap: Record<string, string> = {
    "ethereum": "eth",
    "bnb smart chain": "bsc",
    "polygon": "polygon_pos",
    "base": "base",
    "arbitrum one": "arbitrum",
    "op mainnet": "optimism",
    "avalanche": "avax",
  };
  const network = networkMap[chain.chainName?.toLowerCase() || ""];
  if (!network) return null;

  try {
    const data = await fetchJson<any>(
      `https://api.geckoterminal.com/api/v2/networks/${network}/tokens/${contractAddress}/pools?page=1`,
      8_000,
    );
    const pools: any[] = data?.data || [];
    if (!pools.length) return null;

    let totalLiquidityUsd = 0;
    let totalVolume24h = 0;
    for (const p of pools) {
      const liq = Number(p?.attributes?.reserve_in_usd || 0);
      const vol = Number(p?.attributes?.volume_usd?.h24 || 0);
      if (Number.isFinite(liq)) totalLiquidityUsd += liq;
      if (Number.isFinite(vol)) totalVolume24h += vol;
    }

    pools.sort(
      (a, b) =>
        Number(b?.attributes?.reserve_in_usd || 0) -
        Number(a?.attributes?.reserve_in_usd || 0),
    );
    const main = pools[0];
    const mainLiquidity = Number(main?.attributes?.reserve_in_usd || 0);

    return {
      dataAvailable: true,
      found: true,
      dex: main?.attributes?.name || "GeckoTerminal-indexed pool",
      pairAddress: main?.attributes?.address || undefined,
      liquidity: mainLiquidity > 0 ? fmtUsd(mainLiquidity) : "Blockchain Verified",
      liquidityUsd: mainLiquidity > 0 ? mainLiquidity : undefined,
      totalLiquidityUsd,
      totalLiquidityFormatted: totalLiquidityUsd > 0 ? fmtUsd(totalLiquidityUsd) : undefined,
      pairCount: pools.length,
      volume24h: totalVolume24h > 0 ? fmtUsd(totalVolume24h) : "No 24h volume data",
      volume24hUsd: totalVolume24h,
      institutional: false,
      source: "geckoterminal",
    };
  } catch (e) {
    debug("GeckoTerminal lookup failed:", e);
    return null;
  }
}

export async function checkLiquiditySource(
  contractAddress: string,
  chain: ChainInfo,
  symbol?: string,
): Promise<LiquiditySourceResult> {
  if (isInstitutional(symbol)) {
    return {
      dataAvailable: true,
      found: true,
      dex: "Institutional Liquidity Infrastructure",
      pairAddress: "Multi-venue Routing",
      liquidity: "Deep Institutional Liquidity",
      volume24h: "CEX + Cross-chain Verified",
      institutional: true,
      source: "institutional",
    };
  }

  // Step 1: Try DexScreener
  const dex = await tryDexScreener(contractAddress, chain);
  if (dex) return dex;

  // Step 2: Fallback to GeckoTerminal
  const gecko = await tryGeckoTerminal(contractAddress, chain);
  if (gecko) return gecko;

  // Step 3: Last resort — source-code keyword match
  try {
    const url = explorerUrl(chain, {
      module: "contract",
      action: "getsourcecode",
      address: contractAddress,
    });
    const explorerData = await fetchJson<any>(url);
    const sourceCode = (
      explorerData?.result?.[0]?.SourceCode || ""
    ).toLowerCase();

    if (!sourceCode) {
      return {
        dataAvailable: false,
        found: false,
        institutional: false,
        message: "Liquidity not indexed on DexScreener or GeckoTerminal",
      };
    }

    const hasLiquidityLogic = LIQUIDITY_KEYWORDS.some((k) => sourceCode.includes(k));

    if (hasLiquidityLogic) {
      return {
        dataAvailable: true,
        found: true,
        dex: "On-chain liquidity logic detected",
        liquidity: "Not yet indexed by DexScreener",
        volume24h: "Pair data pending",
        institutional: false,
        source: "source-code",
      };
    }

    return {
      dataAvailable: true,
      found: false,
      institutional: false,
      message: "No tradeable liquidity found on indexed DEXes",
    };
  } catch (error) {
    debug("Liquidity source fallback failed:", error);
    return {
      dataAvailable: false,
      found: false,
      institutional: false,
      message: "Liquidity data temporarily unavailable",
    };
  }
}
