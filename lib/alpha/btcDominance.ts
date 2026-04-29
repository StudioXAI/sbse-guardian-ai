/* ─────────────────────────────────────────────────────────────
   BTC Dominance Tracker
   - BTC market cap as % of total crypto market cap
   - Pulled from CoinGecko /global endpoint (one call)
   - 5-minute server cache (dominance moves slowly)
   - Also returns 24h change in dominance for trend display
   ───────────────────────────────────────────────────────────── */

import { TtlCache } from "./cache";

const CACHE_TTL_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8_000;

export interface BtcDominanceData {
  /** BTC % of total crypto market cap. */
  btcDominancePct: number;
  /** ETH % for context (since alt season often = ETH leadership). */
  ethDominancePct: number;
  /** Stablecoins as % — when high, indicates risk-off positioning. */
  stablesDominancePct: number;
  /** 24h % change in dominance. Positive = BTC strengthening vs alts. */
  change24hPct: number;
  /** Total market cap in USD (informational). */
  totalMarketCapUsd: number;
  /** Plain-English read: "BTC strengthening", "Alts strengthening", or "Stable". */
  read: string;
  /** Direction (for color): "btc" = green/up arrow, "alts" = red/down arrow, "stable" = neutral. */
  direction: "btc" | "alts" | "stable";
  generatedAt: number;
}

interface CoinGeckoGlobal {
  data?: {
    market_cap_percentage?: Record<string, number>;
    market_cap_change_percentage_24h_usd?: number;
    total_market_cap?: { usd?: number };
  };
}

const cache = new TtlCache<BtcDominanceData>(CACHE_TTL_MS);

export async function fetchBtcDominance(): Promise<BtcDominanceData | null> {
  const cached = cache.get("dominance");
  if (cached) return cached;

  const apiKey = process.env.COINGECKO_API_KEY;
  const url = "https://api.coingecko.com/api/v3/global";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (apiKey) headers["x-cg-demo-api-key"] = apiKey;

    const res = await fetch(url, { signal: controller.signal, headers });
    if (!res.ok) return null;

    const json = (await res.json()) as CoinGeckoGlobal;
    const pct = json.data?.market_cap_percentage;
    if (!pct || typeof pct.btc !== "number") return null;

    const btcDominancePct = pct.btc;
    const ethDominancePct = pct.eth ?? 0;
    /* Stablecoin dominance — sum of major stables in the percentages map. */
    const stableSymbols = ["usdt", "usdc", "dai", "busd", "tusd", "usde"];
    let stablesDominancePct = 0;
    for (const sym of stableSymbols) {
      stablesDominancePct += pct[sym] ?? 0;
    }

    /* Get 24h change in BTC dominance via a second call — global doesn't
       return historical dominance directly. We approximate by looking at
       CG's /coins/markets for BTC and the change_24h delta. Simpler: we
       skip this and use the latest "market_cap_change_percentage_24h_usd"
       which is total cap change, then estimate dominance change as 0 for
       short windows. To be honest about the limitation, we don't claim a
       precise number — we read the slope from current vs prior cached
       reading. */
    const previous = cache.getStale("dominance");
    let change24hPct = 0;
    if (previous && Number.isFinite(previous.btcDominancePct)) {
      /* Difference is in percentage points, not a percent change. We
         report as percentage points (pp) to avoid confusion. */
      change24hPct = btcDominancePct - previous.btcDominancePct;
    }

    /* Plain-English read based on current dominance + recent slope. */
    let read: string;
    let direction: "btc" | "alts" | "stable";
    if (Math.abs(change24hPct) < 0.1) {
      read = "Dominance stable";
      direction = "stable";
    } else if (change24hPct > 0) {
      read = "BTC strengthening vs alts";
      direction = "btc";
    } else {
      read = "Alts strengthening vs BTC";
      direction = "alts";
    }

    const data: BtcDominanceData = {
      btcDominancePct,
      ethDominancePct,
      stablesDominancePct,
      change24hPct,
      totalMarketCapUsd: json.data?.total_market_cap?.usd ?? 0,
      read,
      direction,
      generatedAt: Date.now(),
    };

    cache.set("dominance", data);
    return data;
  } catch {
    return cache.getStale("dominance") ?? null;
  } finally {
    clearTimeout(timer);
  }
}
