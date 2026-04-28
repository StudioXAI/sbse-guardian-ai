/* ─────────────────────────────────────────────────────────────
   Top Markets — top 50 crypto + top 50 stocks
   Crypto chain: CoinGecko → CoinPaprika → CoinCap
   Stocks chain: Finnhub (if FINNHUB_API_KEY set) → Stooq CSV
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

/* ═══════════════════════════════════════════════════════════ */
/* CRYPTO — three-tier fallback                                */
/* ═══════════════════════════════════════════════════════════ */

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
    /* CoinGecko free tier sometimes returns 200 with {status:{error_code:429}}. */
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
    const res = await fetch("https://api.coinpaprika.com/v1/tickers", {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return [];

    const json = await res.json();
    if (!Array.isArray(json)) return [];

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
          change7dPct: change24h, // 7d not available, approximate with 24h
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

  let rows = await fetchFromCoinGecko();
  if (rows.length < 10) rows = await fetchFromCoinPaprika();
  if (rows.length < 10) rows = await fetchFromCoinCap();

  if (rows.length > 0) {
    cryptoCache.set("top50", rows);
    return rows;
  }
  return cryptoCache.getStale("top50") ?? [];
}

/* ═══════════════════════════════════════════════════════════ */
/* STOCKS — Finnhub (if key) → Stooq fallback                  */
/* ═══════════════════════════════════════════════════════════ */

const TOP_STOCK_SYMBOLS: Array<{ symbol: string; name: string }> = [
  { symbol: "AAPL", name: "Apple" },
  { symbol: "MSFT", name: "Microsoft" },
  { symbol: "NVDA", name: "NVIDIA" },
  { symbol: "GOOGL", name: "Alphabet" },
  { symbol: "AMZN", name: "Amazon" },
  { symbol: "META", name: "Meta Platforms" },
  { symbol: "TSLA", name: "Tesla" },
  { symbol: "BRK-B", name: "Berkshire Hathaway" },
  { symbol: "LLY", name: "Eli Lilly" },
  { symbol: "JPM", name: "JPMorgan Chase" },
  { symbol: "AVGO", name: "Broadcom" },
  { symbol: "WMT", name: "Walmart" },
  { symbol: "V", name: "Visa" },
  { symbol: "XOM", name: "Exxon Mobil" },
  { symbol: "UNH", name: "UnitedHealth" },
  { symbol: "MA", name: "Mastercard" },
  { symbol: "JNJ", name: "Johnson & Johnson" },
  { symbol: "PG", name: "Procter & Gamble" },
  { symbol: "ORCL", name: "Oracle" },
  { symbol: "HD", name: "Home Depot" },
  { symbol: "COST", name: "Costco" },
  { symbol: "ABBV", name: "AbbVie" },
  { symbol: "BAC", name: "Bank of America" },
  { symbol: "CVX", name: "Chevron" },
  { symbol: "MRK", name: "Merck" },
  { symbol: "KO", name: "Coca-Cola" },
  { symbol: "AMD", name: "AMD" },
  { symbol: "PEP", name: "PepsiCo" },
  { symbol: "CRM", name: "Salesforce" },
  { symbol: "ADBE", name: "Adobe" },
  { symbol: "WFC", name: "Wells Fargo" },
  { symbol: "MCD", name: "McDonald's" },
  { symbol: "TMO", name: "Thermo Fisher" },
  { symbol: "CSCO", name: "Cisco" },
  { symbol: "ABT", name: "Abbott Laboratories" },
  { symbol: "ACN", name: "Accenture" },
  { symbol: "LIN", name: "Linde" },
  { symbol: "DIS", name: "Disney" },
  { symbol: "TMUS", name: "T-Mobile US" },
  { symbol: "INTC", name: "Intel" },
  { symbol: "NFLX", name: "Netflix" },
  { symbol: "PM", name: "Philip Morris" },
  { symbol: "DHR", name: "Danaher" },
  { symbol: "VZ", name: "Verizon" },
  { symbol: "INTU", name: "Intuit" },
  { symbol: "CMCSA", name: "Comcast" },
  { symbol: "QCOM", name: "Qualcomm" },
  { symbol: "IBM", name: "IBM" },
  { symbol: "TXN", name: "Texas Instruments" },
  { symbol: "AMGN", name: "Amgen" },
];

/* ─── Stocks: Finnhub (primary if key configured) ─── */

interface FinnhubQuote {
  c?: number; // current price
  d?: number; // change
  dp?: number; // change percent
  h?: number; // high
  l?: number; // low
  o?: number; // open
  pc?: number; // previous close
}

async function fetchOneFinnhub(
  sym: { symbol: string; name: string },
  apiKey: string,
): Promise<StockRow | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${sym.symbol}&token=${apiKey}`,
      { signal: controller.signal, headers: { Accept: "application/json" } },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as FinnhubQuote;
    if (typeof json.c !== "number" || json.c <= 0) return null;
    return {
      rank: 0,
      symbol: sym.symbol,
      name: sym.name,
      priceUsd: json.c,
      change24hPct: json.dp ?? 0,
      marketCapUsd: 0, // Finnhub /quote doesn't return market cap
      exchange: "NASDAQ/NYSE",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchFromFinnhub(): Promise<StockRow[]> {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) return [];

  /* Finnhub free tier: 60 calls/min. We have 50 symbols so we're under
     the limit but parallelize to keep latency low. */
  const results = await Promise.all(
    TOP_STOCK_SYMBOLS.map((s) => fetchOneFinnhub(s, apiKey)),
  );
  return results
    .filter((r): r is StockRow => r !== null)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

/* ─── Stocks: Stooq CSV fallback ─── */

interface StooqQuote {
  symbol: string;
  open: number;
  close: number;
}

function parseStooqCsv(csv: string): StooqQuote[] {
  /* With format param `f=sd2t2ohlcv` and header param `h`, Stooq returns:
     Symbol,Date,Time,Open,High,Low,Close,Volume   (8 columns) */
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const out: StooqQuote[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols.length < 8) continue;
    const symbol = cols[0]?.toLowerCase().trim();
    const open = parseFloat(cols[3]);
    const close = parseFloat(cols[6]);
    if (!symbol || !Number.isFinite(close) || close <= 0) continue;
    if (!Number.isFinite(open) || open <= 0) continue;
    out.push({ symbol, open, close });
  }
  return out;
}

async function fetchFromStooq(): Promise<StockRow[]> {
  const stooqSymbols = TOP_STOCK_SYMBOLS.map((s) =>
    `${s.symbol.toLowerCase()}.us`,
  ).join("+");
  /* `f=sd2t2ohlcv` requests Symbol+Date+Time+OHLCV (8 cols). The `h`
     flag includes a header row. */
  const url = `https://stooq.com/q/l/?s=${stooqSymbols}&f=sd2t2ohlcv&h&e=csv`;

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

    const quoteMap = new Map(quotes.map((q) => [q.symbol, q]));

    const rows: StockRow[] = [];
    let rank = 1;
    for (const sym of TOP_STOCK_SYMBOLS) {
      const q = quoteMap.get(`${sym.symbol.toLowerCase()}.us`);
      if (!q) continue;
      const change24hPct = ((q.close - q.open) / q.open) * 100;
      rows.push({
        rank: rank++,
        symbol: sym.symbol,
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

  /* Try Finnhub first if configured (most reliable). Fall back to Stooq. */
  let rows = await fetchFromFinnhub();
  if (rows.length < 10) rows = await fetchFromStooq();

  if (rows.length > 0) {
    stockCache.set("top50", rows);
    return rows;
  }
  return stockCache.getStale("top50") ?? [];
}
