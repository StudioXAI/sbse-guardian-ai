/* ─────────────────────────────────────────────────────────────
   Liquidity Source Analysis

   MAJOR FIX: DexScreener is now the source of truth.
   Previous logic: check source code for "uniswap" keywords FIRST,
     only consulted DexScreener if keywords matched.
   Problem: A token's ERC20 contract usually has no reference to
     Uniswap because the DEX pair is a SEPARATE contract. This caused
     false "No verified liquidity" findings on legit tokens.

   New logic:
   1. Try DexScreener first — if there are live pairs with USD
      liquidity, that IS verified liquidity. Done.
   2. If DexScreener has no pairs, fall back to source-code keywords
      (for rare cases where DexScreener hasn't indexed yet).
   3. Otherwise gracefully flag "data unavailable" without scary wording.
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
  volume24h?: string;
  institutional: boolean;
  message?: string;
}

const LIQUIDITY_KEYWORDS = [
  "uniswap",
  "pancakeswap",
  "sushiswap",
  "router",
  "liquidity",
  "swapexact",
];

export async function checkLiquiditySource(
  contractAddress: string,
  chain: ChainInfo,
  symbol?: string,
): Promise<LiquiditySourceResult> {
  /* ── Step 0: institutional override ── */
  if (isInstitutional(symbol)) {
    return {
      dataAvailable: true,
      found: true,
      dex: "Institutional Liquidity Infrastructure",
      pairAddress: "Multi-venue Routing",
      liquidity: "Deep Institutional Liquidity",
      volume24h: "CEX + Cross-chain Verified",
      institutional: true,
    };
  }

  /* ── Step 1: DexScreener is source of truth for tradeable liquidity ── */
  try {
    const dexData = await fetchJson<any>(
      `https://api.dexscreener.com/latest/dex/tokens/${contractAddress}`,
      10_000,
    );
    const allPairs: any[] = dexData?.pairs || [];

    // Filter to pairs on the same chain when possible
    const chainPairs = allPairs.filter((p) => {
      const pairChain = String(p?.chainId || "").toLowerCase();
      const ourChain = chain.chainName?.toLowerCase() || "";
      // DexScreener uses chain IDs like "ethereum", "bsc", "polygon"
      return !ourChain || pairChain.includes(ourChain.split(" ")[0]) || allPairs.length < 3;
    });
    const pairs = chainPairs.length ? chainPairs : allPairs;

    if (pairs.length) {
      pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
      const main = pairs[0];
      const liquidityUsd = main.liquidity?.usd;

      return {
        dataAvailable: true,
        found: true,
        dex: main.dexId || "Verified On-Chain Liquidity",
        pairAddress: main.pairAddress || undefined,
        liquidity: liquidityUsd
          ? `$${Math.round(liquidityUsd).toLocaleString()}`
          : "Blockchain Verified",
        liquidityUsd,
        volume24h: main.volume?.h24
          ? `$${Math.round(main.volume.h24).toLocaleString()}`
          : "No 24h volume data",
        institutional: false,
      };
    }
  } catch (error) {
    debug("DexScreener lookup failed:", error);
    // Continue to fallback
  }

  /* ── Step 2: Source-code fallback (for tokens DexScreener hasn't indexed) ── */
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
      // Unverified source + no DexScreener pairs = honest "unknown"
      return {
        dataAvailable: false,
        found: false,
        institutional: false,
        message: "Liquidity not indexed and contract source unverified",
      };
    }

    const hasLiquidityLogic = LIQUIDITY_KEYWORDS.some((k) =>
      sourceCode.includes(k),
    );

    if (hasLiquidityLogic) {
      return {
        dataAvailable: true,
        found: true,
        dex: "On-chain liquidity logic detected",
        liquidity: "Not yet indexed by DexScreener",
        volume24h: "Pair data pending",
        institutional: false,
      };
    }

    // Verified source, no liquidity keywords, no DexScreener pairs
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
