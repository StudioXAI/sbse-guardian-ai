/* ─────────────────────────────────────────────────────────────
   Socials Enrichment

   Given a token contract address, try to find associated social
   handles by checking external sources in priority order:

     1. CoinGecko — most curated, used when projects formally list
     2. DEX Screener — broader coverage of newer launches

   Returns whatever we find. Most newly-deployed tokens won't have
   any external social registration in the first 24-72 hours, so
   ~70% of lookups return null. That's OK — the UI handles missing
   socials gracefully (just shows the contract address).

   Etherscan source-code parsing (which we considered as a third
   source) is left out for now — the hit rate is low (most contracts
   don't have URLs in their source) and it requires an additional
   Etherscan API call per contract which adds rate-limit pressure.
   Can be added later if the CoinGecko + DEX Screener hit rate
   proves insufficient.
   ───────────────────────────────────────────────────────────── */

import { TtlCache } from "./cache";
import type { ProjectSocials } from "./newProjectScanner";

const ENRICHMENT_TTL_MS = 6 * 60 * 60 * 1000; // 6h
const REQUEST_TIMEOUT_MS = 6_000;

/* Cache per (chainId, address). Even nulls get cached so we don't
   re-query failed lookups. */
type CacheValue = ProjectSocials | { found: false };
const cache = new TtlCache<CacheValue>(ENRICHMENT_TTL_MS);

const CG_PLATFORM: Record<number, string> = {
  1: "ethereum",
  56: "binance-smart-chain",
  137: "polygon-pos",
  42161: "arbitrum-one",
  10: "optimistic-ethereum",
  8453: "base",
};

const DEX_SCREENER_CHAIN: Record<number, string> = {
  1: "ethereum",
  56: "bsc",
  137: "polygon",
  42161: "arbitrum",
  10: "optimism",
  8453: "base",
};

/* ═══════════════════════════════════════════════════════════ */
/* CoinGecko                                                    */
/* ═══════════════════════════════════════════════════════════ */

interface CoinGeckoResponse {
  links?: {
    homepage?: string[];
    twitter_screen_name?: string;
    telegram_channel_identifier?: string;
    chat_url?: string[];
  };
}

async function fetchFromCoinGecko(
  chainId: number,
  address: string,
): Promise<ProjectSocials | null> {
  const platform = CG_PLATFORM[chainId];
  if (!platform) return null;

  const url = `https://api.coingecko.com/api/v3/coins/${platform}/contract/${address}`;
  const cgKey = process.env.COINGECKO_API_KEY;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (cgKey) headers["x-cg-demo-api-key"] = cgKey;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers,
      signal: controller.signal,
    });
    if (!res.ok) return null; // 404 = not listed on CG, normal
    const json = (await res.json()) as CoinGeckoResponse;
    if (!json.links) return null;

    const website = json.links.homepage?.[0];
    const twitter = json.links.twitter_screen_name;
    const telegram = json.links.telegram_channel_identifier;
    const discord = json.links.chat_url?.find((u) =>
      u.toLowerCase().includes("discord"),
    );

    /* Only return if at least one social was found. */
    if (!website && !twitter && !telegram && !discord) return null;

    return {
      website: website || undefined,
      twitter: twitter ? `https://twitter.com/${twitter}` : undefined,
      telegram: telegram ? `https://t.me/${telegram}` : undefined,
      discord: discord || undefined,
      source: "coingecko",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ═══════════════════════════════════════════════════════════ */
/* DEX Screener                                                 */
/* ═══════════════════════════════════════════════════════════ */

interface DexScreenerToken {
  info?: {
    websites?: Array<{ url: string }>;
    socials?: Array<{ type: string; url: string }>;
  };
}

interface DexScreenerResponse {
  pairs?: Array<DexScreenerToken>;
}

async function fetchFromDexScreener(
  chainId: number,
  address: string,
): Promise<ProjectSocials | null> {
  const chain = DEX_SCREENER_CHAIN[chainId];
  if (!chain) return null;

  const url = `https://api.dexscreener.com/latest/dex/tokens/${address}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as DexScreenerResponse;
    if (!Array.isArray(json.pairs) || json.pairs.length === 0) return null;

    /* Look through all pairs for the first one with social info.
       Some pairs have it, some don't, depending on which DEX
       indexed the token first. */
    for (const pair of json.pairs) {
      const info = pair.info;
      if (!info) continue;
      const website = info.websites?.[0]?.url;
      const socials = info.socials ?? [];
      const twitter = socials.find((s) => s.type.toLowerCase() === "twitter")?.url;
      const telegram = socials.find((s) => s.type.toLowerCase() === "telegram")?.url;
      const discord = socials.find((s) => s.type.toLowerCase() === "discord")?.url;

      if (!website && !twitter && !telegram && !discord) continue;
      return {
        website: website || undefined,
        twitter: twitter || undefined,
        telegram: telegram || undefined,
        discord: discord || undefined,
        source: "dexscreener",
      };
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ═══════════════════════════════════════════════════════════ */
/* Public entry                                                 */
/* ═══════════════════════════════════════════════════════════ */

/**
 * Try to find socials for a contract. Returns null if no source
 * has anything. Cached aggressively (6h TTL) since social info
 * rarely changes.
 */
export async function enrichSocials(
  chainId: number,
  address: string,
): Promise<ProjectSocials | null> {
  const cacheKey = `${chainId}-${address.toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    if ("source" in cached) return cached;
    return null; // negative cache hit
  }

  /* Try CoinGecko first (most curated). */
  let result = await fetchFromCoinGecko(chainId, address);
  if (result) {
    cache.set(cacheKey, result);
    return result;
  }

  /* Fall back to DEX Screener (broader coverage). */
  result = await fetchFromDexScreener(chainId, address);
  if (result) {
    cache.set(cacheKey, result);
    return result;
  }

  /* Cache the negative result so we don't keep retrying. */
  cache.set(cacheKey, { found: false });
  return null;
}

/**
 * Enrich a batch of contracts in parallel, with rate limiting.
 * Used after the new project scan to add socials to the records
 * that have just-discovered tokens.
 */
export async function enrichBatch(
  contracts: Array<{ chainId: number; address: string }>,
): Promise<Map<string, ProjectSocials>> {
  const out = new Map<string, ProjectSocials>();
  if (contracts.length === 0) return out;

  /* Run in chunks of 5 to avoid hammering the social APIs. */
  const CHUNK = 5;
  for (let i = 0; i < contracts.length; i += CHUNK) {
    const slice = contracts.slice(i, i + CHUNK);
    const results = await Promise.all(
      slice.map(async (c) => {
        const socials = await enrichSocials(c.chainId, c.address);
        return { address: c.address.toLowerCase(), socials };
      }),
    );
    for (const r of results) {
      if (r.socials) out.set(r.address, r.socials);
    }
  }

  return out;
}
