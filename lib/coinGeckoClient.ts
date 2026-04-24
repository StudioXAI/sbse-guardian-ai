/* ─────────────────────────────────────────────────────────────
   CoinGecko Client — Batch 5C

   Primary source for:
   - Current price (USD)
   - 24h price change %
   - Market cap
   - 24h volume
   - List of all chains a token is on
   - CoinGecko coin ID (for subsequent API calls)

   Free tier: 30 req/min. We don't need many calls per scan (1-2),
   so this scales fine until ~15 scans/min.

   If the user sets COINGECKO_API_KEY env var, we use the Pro endpoint
   which gives much higher limits and historical chart data.

   All lookups return null on failure — never throw.
   Audit code must handle null gracefully.
   ───────────────────────────────────────────────────────────── */

import { debug } from "./constants";

const FREE_API = "https://api.coingecko.com/api/v3";
const PRO_API = "https://pro-api.coingecko.com/api/v3";

function apiBase(): string {
  return process.env.COINGECKO_API_KEY ? PRO_API : FREE_API;
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/json" };
  const key = process.env.COINGECKO_API_KEY;
  if (key) h["x-cg-pro-api-key"] = key;
  return h;
}

/** Maps our chain names to CoinGecko's platform slugs. */
const CHAIN_TO_CG_PLATFORM: Record<string, string> = {
  "ethereum": "ethereum",
  "bnb smart chain": "binance-smart-chain",
  "polygon": "polygon-pos",
  "base": "base",
  "arbitrum one": "arbitrum-one",
  "op mainnet": "optimistic-ethereum",
  "avalanche": "avalanche",
  "fantom": "fantom",
  "cronos": "cronos",
  "gnosis chain": "xdai",
  "linea": "linea",
  "scroll": "scroll",
  "zksync era": "zksync",
};

export interface CoinGeckoLookup {
  coinGeckoId: string;
  name: string;
  symbol: string;
  currentPriceUsd?: number;
  priceChange24hPct?: number;
  marketCapUsd?: number;
  volume24hUsd?: number;
  /** All CG platform slugs the token is deployed on. */
  platforms: string[];
  imageUrl?: string;
  description?: string;
  homepage?: string;
  /** Socials discovered via CoinGecko (useful as extra source alongside DexScreener). */
  twitter?: string;
  telegram?: string;
  reddit?: string;
  github?: string;
}

/** Look up a token by contract + chain. Returns null if CoinGecko doesn't know it. */
export async function lookupTokenByContract(
  contractAddress: string,
  chainName: string,
): Promise<CoinGeckoLookup | null> {
  const platform = CHAIN_TO_CG_PLATFORM[chainName.toLowerCase()];
  if (!platform) {
    debug(`CoinGecko: no platform mapping for "${chainName}"`);
    return null;
  }

  try {
    const url = `${apiBase()}/coins/${platform}/contract/${contractAddress.toLowerCase()}`;
    const res = await fetch(url, {
      method: "GET",
      headers: headers(),
      signal: AbortSignal.timeout(8_000),
    });

    if (res.status === 404) {
      debug(`CoinGecko: token ${contractAddress} not indexed on ${platform}`);
      return null;
    }
    if (!res.ok) {
      debug(`CoinGecko HTTP ${res.status} for ${contractAddress}`);
      return null;
    }

    const data = await res.json();
    if (!data?.id) return null;

    const platforms = Object.keys(data.platforms || {}).filter(
      (p) => data.platforms[p] && p.length > 0,
    );

    const result: CoinGeckoLookup = {
      coinGeckoId: data.id,
      name: data.name || "Unknown",
      symbol: (data.symbol || "").toUpperCase(),
      currentPriceUsd: data?.market_data?.current_price?.usd,
      priceChange24hPct: data?.market_data?.price_change_percentage_24h,
      marketCapUsd: data?.market_data?.market_cap?.usd,
      volume24hUsd: data?.market_data?.total_volume?.usd,
      platforms,
      imageUrl: data?.image?.small || data?.image?.thumb,
      description: truncate(data?.description?.en || "", 1200),
      homepage: firstNonEmpty(data?.links?.homepage),
      twitter: data?.links?.twitter_screen_name
        ? `https://twitter.com/${data.links.twitter_screen_name}`
        : undefined,
      telegram: data?.links?.telegram_channel_identifier
        ? `https://t.me/${data.links.telegram_channel_identifier}`
        : undefined,
      reddit: firstNonEmpty(data?.links?.subreddit_url ? [data.links.subreddit_url] : []),
      github: firstNonEmpty(data?.links?.repos_url?.github),
    };

    return result;
  } catch (e) {
    debug("CoinGecko lookup failed:", e);
    return null;
  }
}

/**
 * Fetch price history (chart points) for a given coinGeckoId.
 * Free tier: last 24h only via ?days=1
 * Pro tier: any range
 * Returns array of [timestamp_ms, price_usd] or null on failure.
 */
export async function fetchPriceHistory(
  coinGeckoId: string,
  days: number = 1,
): Promise<Array<[number, number]> | null> {
  try {
    const url = `${apiBase()}/coins/${encodeURIComponent(
      coinGeckoId,
    )}/market_chart?vs_currency=usd&days=${days}`;
    const res = await fetch(url, {
      method: "GET",
      headers: headers(),
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) {
      debug(`CoinGecko market_chart HTTP ${res.status} for ${coinGeckoId}`);
      return null;
    }

    const data = await res.json();
    if (!Array.isArray(data?.prices)) return null;

    // Downsample if more than ~200 points to keep payload small
    const prices: Array<[number, number]> = data.prices;
    if (prices.length <= 200) return prices;

    const step = Math.ceil(prices.length / 200);
    const sampled: Array<[number, number]> = [];
    for (let i = 0; i < prices.length; i += step) sampled.push(prices[i]);
    // Always include the last point
    if (sampled[sampled.length - 1] !== prices[prices.length - 1]) {
      sampled.push(prices[prices.length - 1]);
    }
    return sampled;
  } catch (e) {
    debug("CoinGecko market_chart failed:", e);
    return null;
  }
}

function firstNonEmpty(arr: unknown): string | undefined {
  if (!Array.isArray(arr)) return undefined;
  for (const s of arr) {
    if (typeof s === "string" && s.trim().length > 0) return s;
  }
  return undefined;
}

function truncate(s: string, n: number): string {
  if (!s) return "";
  const cleaned = s.replace(/\r/g, "").trim();
  if (cleaned.length <= n) return cleaned;
  return cleaned.slice(0, n - 1) + "…";
}
