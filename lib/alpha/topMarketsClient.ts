/* ─────────────────────────────────────────────────────────────
   Top Markets — top 50 crypto + top 50 stocks
   - Crypto: CoinGecko /coins/markets (free with optional API key)
   - Stocks: Yahoo Finance v7 quote endpoint (free, no auth)
   - 5-minute cache for both
   ───────────────────────────────────────────────────────────── */

import { TtlCache } from "./cache";

const CACHE_TTL_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;

export interface CryptoRow {
  rank: number;
  id: string;
  symbol: string;
  name: string;
  priceUsd: number;
  change24hPct: number;
  change7dPct: number;
  marketCapUsd: number;
  volume24hUsd: number;
  imageUrl?: string;
}

export interface StockRow {
  rank: number;
  symbol: string;
  name: string;
  priceUsd: number;
  change24hPct: number;
  marketCapUsd: number;
  exchange?: string;
}

const cryptoCache = new TtlCache<CryptoRow[]>(CACHE_TTL_MS);
const stockCache = new TtlCache<StockRow[]>(CACHE_TTL_MS);

/* ─── Top 50 crypto via CoinGecko ─── */

interface CGCoin {
  id?: string;
  symbol?: string;
  name?: string;
  current_price?: number;
  market_cap?: number;
  market_cap_rank?: number;
  total_volume?: number;
  price_change_percentage_24h?: number;
  price_change_percentage_7d_in_currency?: number;
  image?: string;
}

export async function fetchTop50Crypto(): Promise<CryptoRow[]> {
  const cached = cryptoCache.get("top50");
  if (cached) return cached;

  const apiKey = process.env.COINGECKO_API_KEY;
  const url =
    "https://api.coingecko.com/api/v3/coins/markets" +
    "?vs_currency=usd&order=market_cap_desc&per_page=50&page=1" +
    "&sparkline=false&price_change_percentage=24h,7d";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (apiKey) headers["x-cg-demo-api-key"] = apiKey;

    const res = await fetch(url, { signal: controller.signal, headers });
    if (!res.ok) {
      const stale = cryptoCache.getStale("top50");
      return stale ?? [];
    }

    const json = (await res.json()) as CGCoin[];
    if (!Array.isArray(json)) return [];

    const rows: CryptoRow[] = json
      .filter((c) => c.id && typeof c.current_price === "number")
      .map((c, i) => ({
        rank: c.market_cap_rank ?? i + 1,
        id: c.id ?? "",
        symbol: (c.symbol ?? "").toUpperCase(),
        name: c.name ?? "",
        priceUsd: c.current_price ?? 0,
        change24hPct: c.price_change_percentage_24h ?? 0,
        change7dPct: c.price_change_percentage_7d_in_currency ?? 0,
        marketCapUsd: c.market_cap ?? 0,
        volume24hUsd: c.total_volume ?? 0,
        imageUrl: c.image,
      }));

    if (rows.length > 0) {
      cryptoCache.set("top50", rows);
      return rows;
    }
    const stale = cryptoCache.getStale("top50");
    return stale ?? [];
  } catch {
    const stale = cryptoCache.getStale("top50");
    return stale ?? [];
  } finally {
    clearTimeout(timer);
  }
}

/* ─── Top 50 US stocks via Yahoo Finance ─── */

/* Hardcoded top US stocks by market cap. Yahoo's batch endpoint requires
   the symbol list up front. Order is approximate — we sort by actual
   live market cap from the response. */
const TOP_STOCK_SYMBOLS = [
  "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA", "BRK-B",
  "LLY", "JPM", "AVGO", "WMT", "V", "XOM", "UNH", "MA", "JNJ", "PG",
  "ORCL", "HD", "COST", "ABBV", "BAC", "CVX", "MRK", "KO", "AMD",
  "PEP", "CRM", "ADBE", "WFC", "MCD", "TMO", "CSCO", "ABT", "ACN",
  "LIN", "DIS", "TMUS", "INTC", "NFLX", "PM", "DHR", "VZ", "INTU",
  "CMCSA", "QCOM", "IBM", "TXN", "AMGN",
];

interface YahooQuote {
  symbol?: string;
  shortName?: string;
  longName?: string;
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
  marketCap?: number;
  fullExchangeName?: string;
  exchange?: string;
}

interface YahooResp {
  quoteResponse?: {
    result?: YahooQuote[];
  };
}

export async function fetchTop50Stocks(): Promise<StockRow[]> {
  const cached = stockCache.get("top50");
  if (cached) return cached;

  /* Yahoo's v7 quote endpoint is unofficial but stable when called with
     a real-looking User-Agent. Without it, requests are sometimes 401'd. */
  const url =
    "https://query1.finance.yahoo.com/v7/finance/quote?symbols=" +
    TOP_STOCK_SYMBOLS.join(",");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    if (!res.ok) {
      const stale = stockCache.getStale("top50");
      return stale ?? [];
    }

    const json = (await res.json()) as YahooResp;
    const quotes = json.quoteResponse?.result ?? [];

    const rows: StockRow[] = quotes
      .filter((q) => q.symbol && typeof q.regularMarketPrice === "number")
      .map((q, i) => ({
        rank: i + 1,
        symbol: q.symbol ?? "",
        name: q.shortName ?? q.longName ?? q.symbol ?? "",
        priceUsd: q.regularMarketPrice ?? 0,
        change24hPct: q.regularMarketChangePercent ?? 0,
        marketCapUsd: q.marketCap ?? 0,
        exchange: q.fullExchangeName ?? q.exchange,
      }))
      .sort((a, b) => b.marketCapUsd - a.marketCapUsd)
      .map((row, i) => ({ ...row, rank: i + 1 }));

    if (rows.length > 0) {
      stockCache.set("top50", rows);
      return rows;
    }
    const stale = stockCache.getStale("top50");
    return stale ?? [];
  } catch {
    const stale = stockCache.getStale("top50");
    return stale ?? [];
  } finally {
    clearTimeout(timer);
  }
}
