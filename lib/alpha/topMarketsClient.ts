/* ─────────────────────────────────────────────────────────────
   Top Markets — top 50 crypto + top 50 stocks
   Crypto fallback chain: CoinGecko → CoinPaprika → CoinCap
   Stocks: Stooq CSV (works from cloud IPs, no auth)
   5-minute cache.
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

/* ─── Crypto: CoinGecko (primary) ─── */

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

async function fetchFromCoinGecko(): Promise<CryptoRow[]> {
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
    if (!res.ok) return [];

    const raw = await res.json();
    /* CoinGecko's free tier sometimes returns 200 with an error object
       like {status:{error_code:429,...}} when rate-limited. Detect this
       and treat as a failure so the fallback path engages. */
    if (!Array.isArray(raw)) return [];
    const json = raw as CGCoin[];

    return json
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
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/* ─── Crypto: CoinPaprika (fallback) ─── */

interface PaprikaTicker {
  id?: string;
  name?: string;
  symbol?: string;
  rank?: number;
  quotes?: {
    USD?: {
      price?: number;
      market_cap?: number;
      volume_24h?: number;
      percent_change_24h?: number;
      percent_change_7d?: number;
    };
  };
}

async function fetchFromCoinPaprika(): Promise<CryptoRow[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    /* Note: /v1/tickers returns ~5000 results. The `limit` param is
       unsupported on the free tier — we slice client-side after sort. */
    const res = await fetch("https://api.coinpaprika.com/v1/tickers", {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return [];

    const json = await res.json();
    if (!Array.isArray(json)) return [];

    /* Sort by rank (asc) and take top 50. Some entries are missing rank. */
    const sorted = (json as PaprikaTicker[])
      .filter(
        (t) =>
          t.id &&
          t.symbol &&
          typeof t.rank === "number" &&
          t.rank > 0 &&
          typeof t.quotes?.USD?.price === "number",
      )
      .sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999))
      .slice(0, 50);

    return sorted.map((t, i) => ({
      rank: t.rank ?? i + 1,
      id: t.id ?? "",
      symbol: (t.symbol ?? "").toUpperCase(),
      name: t.name ?? "",
      priceUsd: t.quotes?.USD?.price ?? 0,
      change24hPct: t.quotes?.USD?.percent_change_24h ?? 0,
      change7dPct: t.quotes?.USD?.percent_change_7d ?? 0,
      marketCapUsd: t.quotes?.USD?.market_cap ?? 0,
      volume24hUsd: t.quotes?.USD?.volume_24h ?? 0,
      imageUrl: undefined,
    }));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/* ─── Crypto: CoinCap (last-resort fallback) ─── */

interface CoinCapAsset {
  id?: string;
  rank?: string;
  symbol?: string;
  name?: string;
  priceUsd?: string;
  marketCapUsd?: string;
  volumeUsd24Hr?: string;
  changePercent24Hr?: string;
}

async function fetchFromCoinCap(): Promise<CryptoRow[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch("https://api.coincap.io/v2/assets?limit=50", {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return [];

    const raw = await res.json();
    const data = raw?.data;
    if (!Array.isArray(data)) return [];

    /* CoinCap doesn't provide 7d change directly. We approximate by
       using 24h change as a proxy — better than nothing. The Alt Season
       Index will fall back gracefully if 7d data is missing. */
    return (data as CoinCapAsset[])
      .filter(
        (a) => a.id && a.symbol && a.priceUsd && parseFloat(a.priceUsd) > 0,
      )
      .map((a, i) => {
        const change24h = parseFloat(a.changePercent24Hr ?? "0");
        return {
          rank: parseInt(a.rank ?? `${i + 1}`, 10) || i + 1,
          id: a.id ?? "",
          symbol: (a.symbol ?? "").toUpperCase(),
          name: a.name ?? "",
          priceUsd: parseFloat(a.priceUsd ?? "0"),
          change24hPct: change24h,
          change7dPct: change24h, // approximation
          marketCapUsd: parseFloat(a.marketCapUsd ?? "0"),
          volume24hUsd: parseFloat(a.volumeUsd24Hr ?? "0"),
          imageUrl: undefined,
        };
      });
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchTop50Crypto(): Promise<CryptoRow[]> {
  const cached = cryptoCache.get("top50");
  if (cached) return cached;

  /* Try each source in order. The first one that returns ≥10 rows wins. */
  let rows = await fetchFromCoinGecko();
  if (rows.length < 10) rows = await fetchFromCoinPaprika();
  if (rows.length < 10) rows = await fetchFromCoinCap();

  if (rows.length > 0) {
    cryptoCache.set("top50", rows);
    return rows;
  }
  return cryptoCache.getStale("top50") ?? [];
}

/* ─── Stocks: Stooq CSV ─── */
/* Stooq returns CSV from query.stooq.com — works from cloud IPs without
   any User-Agent gymnastics. Format: Symbol,Date,Time,Open,High,Low,Close,Volume.
   We use Close as price and Open as basis for 24h change.
   Note: Stooq does NOT return market cap, so we approximate by ranking
   based on a hardcoded list (large-cap order is reasonably stable). */

const TOP_STOCK_SYMBOLS: Array<{ symbol: string; name: string }> = [
  { symbol: "aapl", name: "Apple" },
  { symbol: "msft", name: "Microsoft" },
  { symbol: "nvda", name: "NVIDIA" },
  { symbol: "googl", name: "Alphabet" },
  { symbol: "amzn", name: "Amazon" },
  { symbol: "meta", name: "Meta Platforms" },
  { symbol: "tsla", name: "Tesla" },
  { symbol: "brk-b", name: "Berkshire Hathaway" },
  { symbol: "lly", name: "Eli Lilly" },
  { symbol: "jpm", name: "JPMorgan Chase" },
  { symbol: "avgo", name: "Broadcom" },
  { symbol: "wmt", name: "Walmart" },
  { symbol: "v", name: "Visa" },
  { symbol: "xom", name: "Exxon Mobil" },
  { symbol: "unh", name: "UnitedHealth" },
  { symbol: "ma", name: "Mastercard" },
  { symbol: "jnj", name: "Johnson & Johnson" },
  { symbol: "pg", name: "Procter & Gamble" },
  { symbol: "orcl", name: "Oracle" },
  { symbol: "hd", name: "Home Depot" },
  { symbol: "cost", name: "Costco" },
  { symbol: "abbv", name: "AbbVie" },
  { symbol: "bac", name: "Bank of America" },
  { symbol: "cvx", name: "Chevron" },
  { symbol: "mrk", name: "Merck" },
  { symbol: "ko", name: "Coca-Cola" },
  { symbol: "amd", name: "AMD" },
  { symbol: "pep", name: "PepsiCo" },
  { symbol: "crm", name: "Salesforce" },
  { symbol: "adbe", name: "Adobe" },
  { symbol: "wfc", name: "Wells Fargo" },
  { symbol: "mcd", name: "McDonald's" },
  { symbol: "tmo", name: "Thermo Fisher" },
  { symbol: "csco", name: "Cisco" },
  { symbol: "abt", name: "Abbott Laboratories" },
  { symbol: "acn", name: "Accenture" },
  { symbol: "lin", name: "Linde" },
  { symbol: "dis", name: "Disney" },
  { symbol: "tmus", name: "T-Mobile US" },
  { symbol: "intc", name: "Intel" },
  { symbol: "nflx", name: "Netflix" },
  { symbol: "pm", name: "Philip Morris" },
  { symbol: "dhr", name: "Danaher" },
  { symbol: "vz", name: "Verizon" },
  { symbol: "intu", name: "Intuit" },
  { symbol: "cmcsa", name: "Comcast" },
  { symbol: "qcom", name: "Qualcomm" },
  { symbol: "ibm", name: "IBM" },
  { symbol: "txn", name: "Texas Instruments" },
  { symbol: "amgn", name: "Amgen" },
];

interface StooqQuote {
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function parseStooqCsv(csv: string): StooqQuote[] {
  /* Stooq CSV header:
     Symbol,Date,Time,Open,High,Low,Close,Volume */
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const out: StooqQuote[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols.length < 8) continue;
    const symbol = cols[0]?.toLowerCase().trim();
    const open = parseFloat(cols[3]);
    const high = parseFloat(cols[4]);
    const low = parseFloat(cols[5]);
    const close = parseFloat(cols[6]);
    const volume = parseFloat(cols[7]);
    if (!symbol || !Number.isFinite(close) || close <= 0) continue;
    /* Stooq returns "N/D" for closed-market periods. Skip rows where
       open is invalid since we need it for the 24h change calc. */
    if (!Number.isFinite(open) || open <= 0) continue;
    out.push({ symbol, open, high, low, close, volume });
  }
  return out;
}

async function fetchFromStooq(): Promise<StockRow[]> {
  /* Stooq accepts batched symbols using `+` separator and `.us` suffix. */
  const stooqSymbols = TOP_STOCK_SYMBOLS.map((s) => `${s.symbol}.us`).join("+");
  const url = `https://stooq.com/q/l/?s=${stooqSymbols}&f=sohlcv&h&e=csv`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "text/csv" },
    });
    if (!res.ok) return [];
    const csv = await res.text();
    const quotes = parseStooqCsv(csv);
    if (quotes.length === 0) return [];

    /* Build a lookup so we preserve the hardcoded order (which roughly
       matches market cap rank). */
    const quoteMap = new Map(quotes.map((q) => [q.symbol, q]));

    const rows: StockRow[] = [];
    let rank = 1;
    for (const sym of TOP_STOCK_SYMBOLS) {
      /* Stooq returns symbol as "aapl.us" — the `s` field. */
      const q =
        quoteMap.get(`${sym.symbol}.us`) ?? quoteMap.get(sym.symbol);
      if (!q) continue;
      const change24hPct = ((q.close - q.open) / q.open) * 100;
      rows.push({
        rank: rank++,
        symbol: sym.symbol.toUpperCase(),
        name: sym.name,
        priceUsd: q.close,
        change24hPct: Number.isFinite(change24hPct) ? change24hPct : 0,
        marketCapUsd: 0,
        exchange: "NASDAQ/NYSE",
      });
    }
    return rows;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchTop50Stocks(): Promise<StockRow[]> {
  const cached = stockCache.get("top50");
  if (cached) return cached;

  const rows = await fetchFromStooq();
  if (rows.length > 0) {
    stockCache.set("top50", rows);
    return rows;
  }
  return stockCache.getStale("top50") ?? [];
}
