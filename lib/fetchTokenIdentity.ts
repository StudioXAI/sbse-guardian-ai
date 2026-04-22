/* ─────────────────────────────────────────────────────────────
   Token Identity Engine
   Fixes: ChainInfo-aware (uses CORRECT explorer), no axios,
   cleaner override flow, types instead of `any` returns.
   ───────────────────────────────────────────────────────────── */

import { debug } from "./constants";
import { explorerUrl, fetchJson, type ChainInfo } from "./fetchHelpers";

interface StablecoinMeta {
  projectName: string;
  website: string;
  issuer: string;
  fallbackMarketCap: string;
  knownContracts: string[];
}

const STABLECOIN_OVERRIDES: Record<string, StablecoinMeta> = {
  USDC: {
    projectName: "USD Coin",
    website: "https://www.circle.com",
    issuer: "Circle",
    fallbackMarketCap: "$54,653,671,157",
    knownContracts: ["0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"],
  },
  USDT: {
    projectName: "Tether USD",
    website: "https://tether.to",
    issuer: "Tether",
    fallbackMarketCap: "$140,000,000,000",
    knownContracts: ["0xdac17f958d2ee523a2206206994597c13d831ec7"],
  },
  DAI: {
    projectName: "DAI Stablecoin",
    website: "https://makerdao.com",
    issuer: "MakerDAO",
    fallbackMarketCap: "$5,000,000,000",
    knownContracts: ["0x6b175474e89094c44da98b954eedeac495271d0f"],
  },
};

function detectStablecoinByAddress(addr: string): string | null {
  const normalized = addr.toLowerCase();
  for (const [symbol, meta] of Object.entries(STABLECOIN_OVERRIDES)) {
    if (meta.knownContracts.some((a) => a.toLowerCase() === normalized)) {
      return symbol;
    }
  }
  return null;
}

async function fetchLiveMarketCap(
  symbol: string,
  fallback: string,
): Promise<string> {
  const geckoMap: Record<string, string> = {
    USDC: "usd-coin",
    USDT: "tether",
    DAI: "dai",
  };
  const coinId = geckoMap[symbol.toUpperCase()];
  if (!coinId) return fallback;
  try {
    const data = await fetchJson<any>(
      `https://api.coingecko.com/api/v3/coins/${coinId}`,
      8_000,
    );
    const mc = data?.market_data?.market_cap?.usd;
    return mc ? `$${Math.round(mc).toLocaleString()}` : fallback;
  } catch {
    return fallback;
  }
}

export interface TokenIdentity {
  projectName: string;
  symbol: string;
  dex: string;
  marketCap: string;
  website: string | null;
  issuer?: string;
}

export async function fetchTokenIdentity(
  contractAddress: string,
  chain: ChainInfo,
): Promise<TokenIdentity> {
  try {
    /* Step 0: Hard override by known contract address. */
    const forced = detectStablecoinByAddress(contractAddress);
    if (forced && STABLECOIN_OVERRIDES[forced]) {
      const meta = STABLECOIN_OVERRIDES[forced];
      const marketCap = await fetchLiveMarketCap(forced, meta.fallbackMarketCap);
      return {
        projectName: meta.projectName,
        symbol: forced,
        dex: "Institutional Liquidity",
        marketCap,
        website: meta.website,
        issuer: meta.issuer,
      };
    }

    /* Step 1: Explorer token info on the CORRECT chain. */
    let symbol = "Unknown";
    let projectName = "Unknown Project";

    try {
      const url = explorerUrl(chain, {
        module: "token",
        action: "tokeninfo",
        contractaddress: contractAddress,
      });
      const data = await fetchJson<any>(url);
      const token = data?.result?.[0];
      if (token) {
        symbol = token.symbol || "Unknown";
        projectName = token.tokenName || "Unknown Project";
      }
    } catch {
      debug("Explorer token info fallback");
    }

    /* Step 2: Symbol-based stablecoin override. */
    const upper = symbol.toUpperCase();
    if (STABLECOIN_OVERRIDES[upper]) {
      const meta = STABLECOIN_OVERRIDES[upper];
      const marketCap = await fetchLiveMarketCap(symbol, meta.fallbackMarketCap);
      return {
        projectName: meta.projectName,
        symbol,
        dex: "Institutional Liquidity",
        marketCap,
        website: meta.website,
        issuer: meta.issuer,
      };
    }

    /* Step 3: DexScreener enrichment. */
    try {
      const dexData = await fetchJson<any>(
        `https://api.dexscreener.com/latest/dex/tokens/${contractAddress}`,
        10_000,
      );
      const pairs: any[] = dexData?.pairs || [];
      if (!pairs.length) {
        return {
          projectName,
          symbol,
          dex: "Unknown",
          marketCap: "Unknown",
          website: null,
        };
      }
      pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
      const main = pairs[0];
      return {
        projectName: main.baseToken?.name || projectName,
        symbol: main.baseToken?.symbol || symbol,
        dex: main.dexId || "Verified Liquidity Source",
        marketCap: main.marketCap
          ? `$${Math.round(main.marketCap).toLocaleString()}`
          : "Unknown",
        website: main.info?.websites?.[0]?.url || null,
      };
    } catch {
      return { projectName, symbol, dex: "Unknown", marketCap: "Unknown", website: null };
    }
  } catch (error) {
    debug("Token identity fetch failed:", error);
    return {
      projectName: "Unknown Project",
      symbol: "Unknown",
      dex: "Unknown",
      marketCap: "Unknown",
      website: null,
    };
  }
}
