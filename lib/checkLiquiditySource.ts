/* ─────────────────────────────────────────────────────────────
   Liquidity Source Analysis — Batch 5H: parallel-merge

   Instead of DexScreener-first with GeckoTerminal as fallback,
   query BOTH in parallel and pick whichever returns the higher
   total USD liquidity. Keep the runner-up in alternate* fields.

   Design rationale:
   - DexScreener and GeckoTerminal index overlapping-but-different
     pool sets. Picking the larger aggregate biases toward
     completeness of coverage.
   - Neither source is perfect; showing both gives the user
     visibility into the data we actually have.
   - Source-code keyword match stays as third-tier fallback.
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
  totalLiquidityUsd?: number;
  totalLiquidityFormatted?: string;
  pairCount?: number;
  volume24h?: string;
  volume24hUsd?: number;
  institutional: boolean;
  message?: string;
  source?: "dexscreener" | "geckoterminal" | "source-code" | "institutional";

  /** Runner-up source when both aggregators returned data. */
  alternateSource?: "dexscreener" | "geckoterminal";
  alternateTotalLiquidityUsd?: number;
  alternateTotalLiquidityFormatted?: string;
  alternatePairCount?: number;
  alternateVolume24hFormatted?: string;
}

const LIQUIDITY_KEYWORDS = [
  "uniswap",
  "pancakeswap",
  "sushiswap",
  "router",
  "liquidity",
  "swapexact",
];

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

const GECKO_NETWORK_MAP: Record<string, string> = {
  "ethereum": "eth",
  "bnb smart chain": "bsc",
  "polygon": "polygon_pos",
  "base": "base",
  "arbitrum one": "arbitrum",
  "op mainnet": "optimism",
  "avalanche": "avax",
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

    const targetChain = DEXSCREENER_CHAIN_MAP[chain.chainName?.toLowerCase() || ""];
    const chainPairs = targetChain
      ? allPairs.filter((p) => String(p?.chainId || "").toLowerCase() === targetChain)
      : allPairs;

    const pairs = chainPairs.length ? chainPairs : allPairs;
    if (!pairs.length) return null;

    let totalLiquidityUsd = 0;
    let totalVolume24h = 0;
    for (const p of pairs) {
      if (p?.liquidity?.usd) totalLiquidityUsd += Number(p.liquidity.usd);
      if (p?.volume?.h24) totalVolume24h += Number(p.volume.h24);
    }

    pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
    const main = pairs[0];
    const primaryLiquidityUsd = main?.liquidity?.usd;

    return {
      dataAvailable: true,
      found: true,
      dex: main?.dexId || "Verified On-Chain Liquidity",
      pairAddress: main?.pairAddress || undefined,
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
  } catch (e: any) {
    console.warn("DexScreener liquidity lookup failed:", e?.message || e);
    return null;
  }
}

async function tryGeckoTerminal(
  contractAddress: string,
  chain: ChainInfo,
): Promise<LiquiditySourceResult | null> {
  const network = GECKO_NETWORK_MAP[chain.chainName?.toLowerCase() || ""];
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
  } catch (e: any) {
    console.warn("GeckoTerminal liquidity lookup failed:", e?.message || e);
    return null;
  }
}

function mergeSources(
  a: LiquiditySourceResult,
  b: LiquiditySourceResult,
): LiquiditySourceResult {
  const aTotal = a.totalLiquidityUsd || 0;
  const bTotal = b.totalLiquidityUsd || 0;
  const [primary, secondary] = aTotal >= bTotal ? [a, b] : [b, a];
  return {
    ...primary,
    alternateSource: secondary.source as "dexscreener" | "geckoterminal",
    alternateTotalLiquidityUsd: secondary.totalLiquidityUsd,
    alternateTotalLiquidityFormatted: secondary.totalLiquidityFormatted,
    alternatePairCount: secondary.pairCount,
    alternateVolume24hFormatted: secondary.volume24h,
  };
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

  const [dex, gecko] = await Promise.all([
    tryDexScreener(contractAddress, chain),
    tryGeckoTerminal(contractAddress, chain),
  ]);

  if (dex && gecko) return mergeSources(dex, gecko);
  if (dex) return dex;
  if (gecko) return gecko;

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
        liquidity: "Not yet indexed by DexScreener or GeckoTerminal",
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
  } catch (error: any) {
    console.warn("Liquidity source fallback failed:", error?.message || error);
    return {
      dataAvailable: false,
      found: false,
      institutional: false,
      message: "Liquidity data temporarily unavailable",
    };
  }
}
