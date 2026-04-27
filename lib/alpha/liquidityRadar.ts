/* ─────────────────────────────────────────────────────────────
   Liquidity Radar
   - Top 10 currencies by combined order-book depth
   - Aggregates bid + ask depth at ±2% from mid for each pair
   - Pulls data from public exchange endpoints (no source labels surfaced)
   - 2-minute cache to avoid excessive endpoint hits
   ───────────────────────────────────────────────────────────── */

import { TtlCache } from "./cache";

const CACHE_TTL_MS = 2 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8_000;

export interface RadarPoint {
  symbol: string;
  /** Total depth in USD (bid + ask within 2% of mid). */
  depthUsd: number;
  /** Mid price for context. */
  midUsd: number;
  /** Bid-side depth as % of total (50% = balanced, >50% = bid-heavy / bullish). */
  bidShare: number;
}

const cache = new TtlCache<RadarPoint[]>(CACHE_TTL_MS);

/* Top 10 most-traded crypto by spot volume. We use USDT pairs since
   those have deepest liquidity. */
const RADAR_PAIRS = [
  "BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "BNBUSDT",
  "DOGEUSDT", "ADAUSDT", "AVAXUSDT", "LINKUSDT", "TONUSDT",
];

interface OrderBookLevel {
  price: number;
  size: number;
}

interface OrderBookData {
  symbol: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

interface BinanceDepthResp {
  bids?: [string, string][];
  asks?: [string, string][];
}

async function fetchBinanceBook(pair: string): Promise<OrderBookData | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://api.binance.com/api/v3/depth?symbol=${pair}&limit=500`,
      { signal: controller.signal, headers: { Accept: "application/json" } },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as BinanceDepthResp;
    if (!Array.isArray(json.bids) || !Array.isArray(json.asks)) return null;
    return {
      symbol: pair,
      bids: json.bids.map(([p, s]) => ({
        price: parseFloat(p),
        size: parseFloat(s),
      })).filter((l) => Number.isFinite(l.price) && Number.isFinite(l.size)),
      asks: json.asks.map(([p, s]) => ({
        price: parseFloat(p),
        size: parseFloat(s),
      })).filter((l) => Number.isFinite(l.price) && Number.isFinite(l.size)),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* Coinbase fallback. Their pairs use BTC-USD format. */
const COINBASE_PAIR_MAP: Record<string, string> = {
  BTCUSDT: "BTC-USD",
  ETHUSDT: "ETH-USD",
  SOLUSDT: "SOL-USD",
  XRPUSDT: "XRP-USD",
  DOGEUSDT: "DOGE-USD",
  ADAUSDT: "ADA-USD",
  AVAXUSDT: "AVAX-USD",
  LINKUSDT: "LINK-USD",
  /* BNB and TON not on Coinbase US — skip. */
};

interface CoinbaseBookResp {
  bids?: [string, string, number][];
  asks?: [string, string, number][];
}

async function fetchCoinbaseBook(pair: string): Promise<OrderBookData | null> {
  const cbPair = COINBASE_PAIR_MAP[pair];
  if (!cbPair) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://api.exchange.coinbase.com/products/${cbPair}/book?level=2`,
      { signal: controller.signal, headers: { Accept: "application/json" } },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as CoinbaseBookResp;
    if (!Array.isArray(json.bids) || !Array.isArray(json.asks)) return null;
    return {
      symbol: pair,
      bids: json.bids.map(([p, s]) => ({
        price: parseFloat(p),
        size: parseFloat(s),
      })).filter((l) => Number.isFinite(l.price) && Number.isFinite(l.size)),
      asks: json.asks.map(([p, s]) => ({
        price: parseFloat(p),
        size: parseFloat(s),
      })).filter((l) => Number.isFinite(l.price) && Number.isFinite(l.size)),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function computeDepth(book: OrderBookData): RadarPoint {
  const bestBid = book.bids[0]?.price ?? 0;
  const bestAsk = book.asks[0]?.price ?? 0;
  const mid = bestBid && bestAsk ? (bestBid + bestAsk) / 2 : bestBid || bestAsk;

  /* Sum bid/ask USD depth within 2% of mid. */
  const lowerBound = mid * 0.98;
  const upperBound = mid * 1.02;

  const bidUsd = book.bids
    .filter((l) => l.price >= lowerBound)
    .reduce((acc, l) => acc + l.price * l.size, 0);
  const askUsd = book.asks
    .filter((l) => l.price <= upperBound)
    .reduce((acc, l) => acc + l.price * l.size, 0);

  const total = bidUsd + askUsd;
  const symbol = book.symbol.replace("USDT", "").replace("USD", "");

  return {
    symbol,
    depthUsd: total,
    midUsd: mid,
    bidShare: total > 0 ? (bidUsd / total) * 100 : 50,
  };
}

export async function fetchLiquidityRadar(): Promise<RadarPoint[]> {
  const cached = cache.get("radar");
  if (cached) return cached;

  /* Fetch all pairs in parallel; fall back to Coinbase if Binance is
     blocked (common for US-region serverless). */
  const tasks = RADAR_PAIRS.map(async (pair) => {
    let book = await fetchBinanceBook(pair);
    if (!book) book = await fetchCoinbaseBook(pair);
    return book ? computeDepth(book) : null;
  });

  const results = (await Promise.all(tasks)).filter(
    (r): r is RadarPoint => r !== null,
  );

  if (results.length > 0) {
    cache.set("radar", results);
    return results;
  }
  return cache.getStale("radar") ?? [];
}
