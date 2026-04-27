/* ─────────────────────────────────────────────────────────────
   Alt Season Index
   - Classic CoinMarketCap-style metric: how many of the top 50
     altcoins outperform Bitcoin over a recent window
   - 0-25:   Bitcoin Season (BTC dominance period)
   - 25-40:  Bitcoin Bias
   - 40-60:  Mixed / Transitional
   - 60-75:  Alt Bias
   - 75-100: Alt Season (capital rotating into altcoins)
   - We use 7d performance since CoinGecko's free tier returns it
     directly. Reuses cached top-50 data, so 5-min refresh.
   ───────────────────────────────────────────────────────────── */

import { TtlCache } from "./cache";
import { fetchTop50Crypto } from "./topMarketsClient";

const CACHE_TTL_MS = 5 * 60 * 1000;

/* Stablecoins are excluded from the index — their performance is
   pegged to USD, not driven by alt-vs-BTC capital rotation. */
const STABLECOINS = new Set([
  "usdt", "usdc", "dai", "tusd", "busd", "frax", "lusd",
  "usdd", "fdusd", "pyusd", "usde", "rusd", "gusd", "usdp",
]);

/* Wrapped BTC variants behave like BTC; exclude. */
const BTC_PROXIES = new Set(["btc", "wbtc", "tbtc", "renbtc", "btcb"]);

export type SeasonLabel =
  | "Bitcoin Season"
  | "Bitcoin Bias"
  | "Mixed"
  | "Alt Bias"
  | "Alt Season";

export interface AltSeasonData {
  /** 0-100. Percentage of qualifying altcoins outperforming BTC. */
  index: number;
  label: SeasonLabel;
  altcoinsOutperforming: number;
  totalAltcoins: number;
  btcChange7dPct: number;
  /** Top 5 altcoins outperforming BTC (for highlight cards). */
  topPerformers: Array<{
    symbol: string;
    name: string;
    change7dPct: number;
    outperformanceVsBtcPct: number;
    imageUrl?: string;
  }>;
  generatedAt: number;
}

const cache = new TtlCache<AltSeasonData | null>(CACHE_TTL_MS);

function labelFor(index: number): SeasonLabel {
  if (index >= 75) return "Alt Season";
  if (index >= 60) return "Alt Bias";
  if (index >= 40) return "Mixed";
  if (index >= 25) return "Bitcoin Bias";
  return "Bitcoin Season";
}

export async function computeAltSeasonIndex(): Promise<AltSeasonData | null> {
  const cached = cache.get("index");
  if (cached !== undefined) return cached;

  const coins = await fetchTop50Crypto();
  if (coins.length === 0) {
    cache.set("index", null);
    return null;
  }

  const btc = coins.find((c) => c.symbol.toLowerCase() === "btc");
  if (!btc) {
    cache.set("index", null);
    return null;
  }
  const btcChange = btc.change7dPct;

  /* Filter to qualifying altcoins. */
  const altcoins = coins.filter((c) => {
    const sym = c.symbol.toLowerCase();
    return !BTC_PROXIES.has(sym) && !STABLECOINS.has(sym);
  });

  if (altcoins.length === 0) {
    cache.set("index", null);
    return null;
  }

  const outperformers = altcoins.filter((a) => a.change7dPct > btcChange);
  const index = Math.round((outperformers.length / altcoins.length) * 100);

  const topPerformers = outperformers
    .map((a) => ({
      symbol: a.symbol,
      name: a.name,
      change7dPct: a.change7dPct,
      outperformanceVsBtcPct: a.change7dPct - btcChange,
      imageUrl: a.imageUrl,
    }))
    .sort((a, b) => b.outperformanceVsBtcPct - a.outperformanceVsBtcPct)
    .slice(0, 5);

  const data: AltSeasonData = {
    index,
    label: labelFor(index),
    altcoinsOutperforming: outperformers.length,
    totalAltcoins: altcoins.length,
    btcChange7dPct: btcChange,
    topPerformers,
    generatedAt: Date.now(),
  };

  cache.set("index", data);
  return data;
}
