/* ─────────────────────────────────────────────────────────────
   Token Identity Engine
   Enhancements: extracts social links (Twitter, Telegram, Discord,
   GitHub) alongside website. Used for findings + premium report.
   ───────────────────────────────────────────────────────────── */

import { debug } from "./constants";
import { explorerUrl, fetchJson, type ChainInfo } from "./fetchHelpers";

export interface SocialLinks {
  twitter?: string;
  telegram?: string;
  discord?: string;
  github?: string;
  medium?: string;
  reddit?: string;
}

interface StablecoinMeta {
  projectName: string;
  website: string;
  issuer: string;
  fallbackMarketCap: string;
  knownContracts: string[];
  socials?: SocialLinks;
}

const STABLECOIN_OVERRIDES: Record<string, StablecoinMeta> = {
  USDC: {
    projectName: "USD Coin",
    website: "https://www.circle.com",
    issuer: "Circle",
    fallbackMarketCap: "$54,653,671,157",
    knownContracts: ["0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"],
    socials: {
      twitter: "https://twitter.com/circle",
      github: "https://github.com/circlefin",
    },
  },
  USDT: {
    projectName: "Tether USD",
    website: "https://tether.to",
    issuer: "Tether",
    fallbackMarketCap: "$140,000,000,000",
    knownContracts: ["0xdac17f958d2ee523a2206206994597c13d831ec7"],
    socials: {
      twitter: "https://twitter.com/Tether_to",
    },
  },
  DAI: {
    projectName: "DAI Stablecoin",
    website: "https://makerdao.com",
    issuer: "MakerDAO",
    fallbackMarketCap: "$5,000,000,000",
    knownContracts: ["0x6b175474e89094c44da98b954eedeac495271d0f"],
    socials: {
      twitter: "https://twitter.com/MakerDAO",
      discord: "https://discord.com/invite/RBRumCpEDH",
      github: "https://github.com/makerdao",
      reddit: "https://www.reddit.com/r/MakerDAO/",
    },
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

/**
 * Parse DexScreener info.socials / info.websites into our SocialLinks shape.
 * DexScreener returns: [{ type: "twitter", url: "..." }, ...]
 */
function extractSocials(info: any): SocialLinks {
  const socials: SocialLinks = {};
  if (!info) return socials;

  const socialsArr: any[] = Array.isArray(info.socials) ? info.socials : [];
  for (const item of socialsArr) {
    const type = String(item?.type || "").toLowerCase();
    const url = item?.url;
    if (!url || typeof url !== "string") continue;

    if (type === "twitter" && !socials.twitter) socials.twitter = url;
    else if (type === "telegram" && !socials.telegram) socials.telegram = url;
    else if (type === "discord" && !socials.discord) socials.discord = url;
    else if (type === "github" && !socials.github) socials.github = url;
    else if (type === "medium" && !socials.medium) socials.medium = url;
    else if (type === "reddit" && !socials.reddit) socials.reddit = url;
  }

  return socials;
}

export interface TokenIdentity {
  projectName: string;
  symbol: string;
  dex: string;
  marketCap: string;
  website: string | null;
  issuer?: string;
  socials: SocialLinks;
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
        socials: meta.socials ?? {},
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
        socials: meta.socials ?? {},
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
          socials: {},
        };
      }
      pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
      const main = pairs[0];
      const socials = extractSocials(main.info);

      return {
        projectName: main.baseToken?.name || projectName,
        symbol: main.baseToken?.symbol || symbol,
        dex: main.dexId || "Verified Liquidity Source",
        marketCap: main.marketCap
          ? `$${Math.round(main.marketCap).toLocaleString()}`
          : "Unknown",
        website: main.info?.websites?.[0]?.url || null,
        socials,
      };
    } catch {
      return {
        projectName,
        symbol,
        dex: "Unknown",
        marketCap: "Unknown",
        website: null,
        socials: {},
      };
    }
  } catch (error) {
    debug("Token identity fetch failed:", error);
    return {
      projectName: "Unknown Project",
      symbol: "Unknown",
      dex: "Unknown",
      marketCap: "Unknown",
      website: null,
      socials: {},
    };
  }
}
