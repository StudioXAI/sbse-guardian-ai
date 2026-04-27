/* ─────────────────────────────────────────────────────────────
   Real-Time Order Book Depth — Binance with Coinbase fallback
   - Binance public API can return 451 (region blocked) when called
     from US-based servers (Vercel default region).
   - We try Binance first, fall back to Coinbase Exchange's free
     public API which has no region restriction.
   - 5-second cache.

   Refs:
   - Binance: https://binance-docs.github.io/apidocs/spot/en/#order-book
   - Coinbase: https://docs.cdp.coinbase.com/exchange/reference/exchangerestapi_getproductbook
   ───────────────────────────────────────────────────────────── */

import { TtlCache } from "./cache";

const CACHE_TTL_MS = 5_000;
const REQUEST_TIMEOUT_MS = 6_000;

export interface DepthLevel {
  price: number;
  quantity: number;
  cumulative: number;
  notionalUsd: number;
}

export interface OrderBookSnapshot {
  symbol: string;
  midPrice: number;
  spreadPct: number;
  bids: DepthLevel[];
  asks: DepthLevel[];
  bidWallNotional: number;
  askWallNotional: number;
  imbalancePct: number;
  /** Which exchange the data came from. */
  source: "Binance" | "Coinbase";
  generatedAt: number;
}

const cache = new TtlCache<OrderBookSnapshot>(CACHE_TTL_MS);

const SUPPORTED_SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "DOGEUSDT",
];

/* Map our internal symbol format to per-exchange format. Coinbase
   doesn't list BNB so it falls through to "Order book unavailable"
   only if Binance is also blocked AND the symbol is BNB. */
const COINBASE_MAP: Record<string, string | null> = {
  BTCUSDT: "BTC-USD",
  ETHUSDT: "ETH-USD",
  SOLUSDT: "SOL-USD",
  BNBUSDT: null,
  XRPUSDT: "XRP-USD",
  DOGEUSDT: "DOGE-USD",
};

function buildLevels(
  raw: [string, string][],
  count: number,
): { levels: DepthLevel[]; totalNotional: number } {
  let cumulative = 0;
  let cumulativeNotional = 0;
  const levels: DepthLevel[] = [];
  for (let i = 0; i < Math.min(raw.length, count); i++) {
    const price = parseFloat(raw[i][0]);
    const quantity = parseFloat(raw[i][1]);
    if (!Number.isFinite(price) || !Number.isFinite(quantity)) continue;
    cumulative += quantity;
    cumulativeNotional += price * quantity;
    levels.push({
      price,
      quantity,
      cumulative,
      notionalUsd: cumulativeNotional,
    });
  }
  return { levels, totalNotional: cumulativeNotional };
}

interface BinanceResp {
  bids?: [string, string][];
  asks?: [string, string][];
}

interface CoinbaseResp {
  /* Coinbase returns [price, size, num_orders] tuples. */
  bids?: Array<[string, string, number]>;
  asks?: Array<[string, string, number]>;
}

async function fetchFromBinance(
  symbol: string,
  limit: number,
): Promise<{ bids: [string, string][]; asks: [string, string][] } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://api.binance.com/api/v3/depth?symbol=${symbol}&limit=${limit}`,
      { signal: controller.signal, headers: { Accept: "application/json" } },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as BinanceResp;
    if (!json.bids || !json.asks) return null;
    return { bids: json.bids, asks: json.asks };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchFromCoinbase(
  symbol: string,
): Promise<{ bids: [string, string][]; asks: [string, string][] } | null> {
  const cbSymbol = COINBASE_MAP[symbol];
  if (!cbSymbol) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    /* level=2 returns aggregated-by-price book up to 50 levels per side. */
    const res = await fetch(
      `https://api.exchange.coinbase.com/products/${cbSymbol}/book?level=2`,
      { signal: controller.signal, headers: { Accept: "application/json" } },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as CoinbaseResp;
    if (!json.bids || !json.asks) return null;
    return {
      bids: json.bids.map(([p, s]) => [p, s] as [string, string]),
      asks: json.asks.map(([p, s]) => [p, s] as [string, string]),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchOrderBook(
  symbol: string = "BTCUSDT",
  limit: number = 100,
): Promise<OrderBookSnapshot | null> {
  const cleanSymbol = symbol.toUpperCase();
  if (!SUPPORTED_SYMBOLS.includes(cleanSymbol)) return null;

  const cacheKey = `${cleanSymbol}:${limit}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  /* Try Binance first; if it fails (often due to US geo-block on
     serverless egress IPs) fall back to Coinbase. */
  let raw = await fetchFromBinance(cleanSymbol, limit);
  let source: OrderBookSnapshot["source"] = "Binance";

  if (!raw) {
    raw = await fetchFromCoinbase(cleanSymbol);
    source = "Coinbase";
  }

  if (!raw) {
    const stale = cache.getStale(cacheKey);
    return stale ?? null;
  }

  const { levels: bids, totalNotional: bidNotional } = buildLevels(raw.bids, limit);
  const { levels: asks, totalNotional: askNotional } = buildLevels(raw.asks, limit);

  if (bids.length === 0 || asks.length === 0) {
    const stale = cache.getStale(cacheKey);
    return stale ?? null;
  }

  const bestBid = bids[0].price;
  const bestAsk = asks[0].price;
  const midPrice = (bestBid + bestAsk) / 2;
  const spreadPct = ((bestAsk - bestBid) / midPrice) * 100;

  const totalNotional = bidNotional + askNotional;
  const imbalancePct =
    totalNotional > 0
      ? ((bidNotional - askNotional) / totalNotional) * 100
      : 0;

  const snapshot: OrderBookSnapshot = {
    symbol: cleanSymbol,
    midPrice,
    spreadPct,
    bids,
    asks,
    bidWallNotional: bidNotional,
    askWallNotional: askNotional,
    imbalancePct,
    source,
    generatedAt: Date.now(),
  };

  cache.set(cacheKey, snapshot);
  return snapshot;
}

export const ORDERBOOK_SUPPORTED_SYMBOLS = SUPPORTED_SYMBOLS;
