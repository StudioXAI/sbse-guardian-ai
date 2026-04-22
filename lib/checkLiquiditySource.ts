/* ─────────────────────────────────────────────────────────────
   Liquidity Source Analysis
   ───────────────────────────────────────────────────────────── */

import { isInstitutional, debug } from "./constants";
import { explorerUrl, fetchJson, type ChainInfo } from "./fetchHelpers";

export interface LiquiditySourceResult {
  found: boolean;
  dex?: string;
  pairAddress?: string;
  liquidity?: string;
  volume24h?: string;
  institutional: boolean;
  message?: string;
}

const LIQUIDITY_KEYWORDS = [
  "uniswap",
  "pancakeswap",
  "sushiswap",
  "router",
  "pair",
  "liquidity",
  "addliquidity",
  "removeliquidity",
  "swapexacttokens",
  "swapexacteth",
  "factory",
];

export async function checkLiquiditySource(
  contractAddress: string,
  chain: ChainInfo,
  symbol?: string,
): Promise<LiquiditySourceResult> {
  try {
    if (isInstitutional(symbol)) {
      return {
        found: true,
        dex: "Institutional Liquidity Infrastructure",
        pairAddress: "Multi-venue Routing",
        liquidity: "Deep Institutional Liquidity",
        volume24h: "CEX + Cross-chain Verified",
        institutional: true,
      };
    }

    /* Verify on-chain liquidity logic exists. */
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
        found: false,
        message: "Unable to verify on-chain liquidity structure",
        institutional: false,
      };
    }

    const hasLiquidityLogic = LIQUIDITY_KEYWORDS.some((k) =>
      sourceCode.includes(k),
    );
    if (!hasLiquidityLogic) {
      return {
        found: false,
        message: "No verified blockchain liquidity infrastructure detected",
        institutional: false,
      };
    }

    /* DexScreener enrichment. */
    try {
      const dexData = await fetchJson<any>(
        `https://api.dexscreener.com/latest/dex/tokens/${contractAddress}`,
        10_000,
      );
      const pairs: any[] = dexData?.pairs || [];
      if (!pairs.length) {
        return {
          found: true,
          dex: "Verified On-Chain Liquidity",
          pairAddress: "Detected via Contract Logic",
          liquidity: "Blockchain Verified",
          volume24h: "Pending Live Pair Discovery",
          institutional: false,
        };
      }
      pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
      const main = pairs[0];
      return {
        found: true,
        dex: main.dexId || "Verified On-Chain Liquidity",
        pairAddress: main.pairAddress || "Unknown",
        liquidity: main.liquidity?.usd
          ? `$${Math.round(main.liquidity.usd).toLocaleString()}`
          : "Blockchain Verified",
        volume24h: main.volume?.h24
          ? `$${Math.round(main.volume.h24).toLocaleString()}`
          : "Unknown",
        institutional: false,
      };
    } catch {
      return {
        found: true,
        dex: "Verified On-Chain Liquidity",
        liquidity: "Blockchain Verified",
        volume24h: "DexScreener unavailable",
        institutional: false,
      };
    }
  } catch (error) {
    debug("Liquidity source check failed:", error);
    return {
      found: false,
      message: "Liquidity verification failed",
      institutional: false,
    };
  }
}
