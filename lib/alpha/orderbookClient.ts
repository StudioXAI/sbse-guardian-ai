/* ─────────────────────────────────────────────────────────────
   Real-Time Order Book Depth — Binance Public API
   - Free public REST endpoint, no auth needed
   - Returns 100 levels of bids and asks
   - Bookmap-equivalent depth visualization (Bookmap's desktop app
     has no public API, so this gives the same data via Binance)
   - 5-second cache (depth changes very fast, but we don't need
     sub-second precision for an overview view)

   Reference: https://binance-docs.github.io/apidocs/spot/en/#order-book
   ───────────────────────────────────────────────────────────── */

import { TtlCache } from "./cache";

const CACHE_TTL_MS = 5_000;
const REQUEST_TIMEOUT_MS = 6_000;
const BINANCE_DEPTH = "https://api.binance.com/api/v3/depth";

export interface DepthLevel {
  price: number;
  quantity: number;
  /** Cumulative quantity from spread to this level. */
  cumulative: number;
  /** Cumulative notional in USD. */
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
  imbalancePct: number; // -100 (sell-heavy) to +100 (buy-heavy)
  generatedAt: number;
}

interface BinanceDepthResp {
  bids?: [string, string][];
  asks?: [string, string][];
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

function buildLevels(raw: [string, string][], count: number): {
  levels: DepthLevel[];
  totalNotional: number;
} {
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

export async function fetchOrderBook(
  symbol: string = "BTCUSDT",
  limit: number = 100,
): Promise<OrderBookSnapshot | null> {
  const cleanSymbol = symbol.toUpperCase();
  if (!SUPPORTED_SYMBOLS.includes(cleanSymbol)) return null;

  const cacheKey = `${cleanSymbol}:${limit}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${BINANCE_DEPTH}?symbol=${cleanSymbol}&limit=${limit}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      const stale = cache.getStale(cacheKey);
      return stale ?? null;
    }

    const json = (await res.json()) as BinanceDepthResp;
    const bidsRaw = json.bids ?? [];
    const asksRaw = json.asks ?? [];

    if (bidsRaw.length === 0 || asksRaw.length === 0) {
      const stale = cache.getStale(cacheKey);
      return stale ?? null;
    }

    const { levels: bids, totalNotional: bidNotional } = buildLevels(bidsRaw, limit);
    const { levels: asks, totalNotional: askNotional } = buildLevels(asksRaw, limit);

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
      generatedAt: Date.now(),
    };

    cache.set(cacheKey, snapshot);
    return snapshot;
  } catch {
    const stale = cache.getStale(cacheKey);
    return stale ?? null;
  } finally {
    clearTimeout(timer);
  }
}

export const ORDERBOOK_SUPPORTED_SYMBOLS = SUPPORTED_SYMBOLS;
