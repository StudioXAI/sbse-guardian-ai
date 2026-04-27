/* ─────────────────────────────────────────────────────────────
   Liquidity Heatmap
   - Top 10 currencies by trading volume
   - Bucketizes order book into 21 price bands (±5% from mid in 0.5% steps)
   - Detects bid wall (deepest long-side concentration) and
     ask wall (deepest short-side concentration) per market
   - Generates AI-style narrative insights from the data
   - 2-minute cache
   ───────────────────────────────────────────────────────────── */

import { TtlCache } from "./cache";

const CACHE_TTL_MS = 2 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8_000;

const NUM_BUCKETS = 21;       // -10 to +10 (0 is mid)
const BUCKET_PCT = 0.5;       // each bucket is 0.5% wide
const MID_INDEX = 10;
const RANGE_PCT_FOR_DEPTH = 2.0; // count "depth" within ±2% of mid

export interface RadarPoint {
  symbol: string;
  midUsd: number;
  /** Total bid+ask USD value within ±2% of mid (the most relevant range). */
  depthUsd: number;
  /** Bid share of close-range depth, 0-100 (>50 = bid-heavy). */
  bidShare: number;
  /** Bid wall — the price band with deepest concentrated buy orders. */
  bidWallPrice: number;
  bidWallUsd: number;
  /** Negative number, e.g. -0.6 means 0.6% below spot. */
  bidWallPctFromSpot: number;
  bidWallIndex: number;
  /** Ask wall — the price band with deepest concentrated sell orders. */
  askWallPrice: number;
  askWallUsd: number;
  /** Positive number, e.g. +0.4 means 0.4% above spot. */
  askWallPctFromSpot: number;
  askWallIndex: number;
  /** USD value in each of the 21 price bands. */
  depthBuckets: number[];
}

export interface LiquidityHeatmapData {
  points: RadarPoint[];
  insights: string[];
  generatedAt: number;
}

const cache = new TtlCache<LiquidityHeatmapData>(CACHE_TTL_MS);

/* USDT pairs have the deepest spot liquidity. */
const RADAR_PAIRS = [
  "BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "BNBUSDT",
  "DOGEUSDT", "ADAUSDT", "AVAXUSDT", "LINKUSDT", "TONUSDT",
];

interface OrderBookLevel { price: number; size: number; }
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
      bids: json.bids
        .map(([p, s]) => ({ price: parseFloat(p), size: parseFloat(s) }))
        .filter((l) => Number.isFinite(l.price) && Number.isFinite(l.size)),
      asks: json.asks
        .map(([p, s]) => ({ price: parseFloat(p), size: parseFloat(s) }))
        .filter((l) => Number.isFinite(l.price) && Number.isFinite(l.size)),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* Coinbase fallback for US-region serverless where Binance is blocked. */
const COINBASE_PAIR_MAP: Record<string, string> = {
  BTCUSDT: "BTC-USD",
  ETHUSDT: "ETH-USD",
  SOLUSDT: "SOL-USD",
  XRPUSDT: "XRP-USD",
  DOGEUSDT: "DOGE-USD",
  ADAUSDT: "ADA-USD",
  AVAXUSDT: "AVAX-USD",
  LINKUSDT: "LINK-USD",
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
      bids: json.bids
        .map(([p, s]) => ({ price: parseFloat(p), size: parseFloat(s) }))
        .filter((l) => Number.isFinite(l.price) && Number.isFinite(l.size)),
      asks: json.asks
        .map(([p, s]) => ({ price: parseFloat(p), size: parseFloat(s) }))
        .filter((l) => Number.isFinite(l.price) && Number.isFinite(l.size)),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* Bucketize order book into 21 price bands and locate walls. */
function bucketize(book: OrderBookData): RadarPoint | null {
  const bestBid = book.bids[0]?.price ?? 0;
  const bestAsk = book.asks[0]?.price ?? 0;
  const mid = bestBid && bestAsk ? (bestBid + bestAsk) / 2 : (bestBid || bestAsk);
  if (!mid || mid <= 0) return null;

  const buckets: number[] = new Array(NUM_BUCKETS).fill(0);

  /* Bid levels (price ≤ mid → distancePct ≤ 0 → bucket 0..10) */
  for (const l of book.bids) {
    const distancePct = ((l.price - mid) / mid) * 100;
    const bucketIdx = MID_INDEX + Math.floor(distancePct / BUCKET_PCT);
    if (bucketIdx >= 0 && bucketIdx <= MID_INDEX) {
      buckets[bucketIdx] += l.price * l.size;
    }
  }

  /* Ask levels (price ≥ mid → distancePct ≥ 0 → bucket 10..20) */
  for (const l of book.asks) {
    const distancePct = ((l.price - mid) / mid) * 100;
    const bucketIdx = MID_INDEX + Math.floor(distancePct / BUCKET_PCT);
    if (bucketIdx >= MID_INDEX && bucketIdx < NUM_BUCKETS) {
      buckets[bucketIdx] += l.price * l.size;
    }
  }

  /* Find bid wall — biggest bucket on the bid side (excludes mid bucket). */
  let bidWallIdx = 0;
  let bidWallSize = 0;
  for (let i = 0; i < MID_INDEX; i++) {
    if (buckets[i] > bidWallSize) {
      bidWallSize = buckets[i];
      bidWallIdx = i;
    }
  }
  /* Use the center of the bucket for the wall price. */
  const bidWallPct = (bidWallIdx - MID_INDEX) * BUCKET_PCT + BUCKET_PCT / 2;
  const bidWallPrice = mid * (1 + bidWallPct / 100);

  /* Find ask wall — biggest bucket on the ask side (excludes mid bucket). */
  let askWallIdx = MID_INDEX + 1;
  let askWallSize = 0;
  for (let i = MID_INDEX + 1; i < NUM_BUCKETS; i++) {
    if (buckets[i] > askWallSize) {
      askWallSize = buckets[i];
      askWallIdx = i;
    }
  }
  const askWallPct = (askWallIdx - MID_INDEX) * BUCKET_PCT + BUCKET_PCT / 2;
  const askWallPrice = mid * (1 + askWallPct / 100);

  /* Close-range depth (within ±2% of mid) and bid share. */
  const closeRangeStart = MID_INDEX - Math.round(RANGE_PCT_FOR_DEPTH / BUCKET_PCT);
  const closeRangeEnd = MID_INDEX + Math.round(RANGE_PCT_FOR_DEPTH / BUCKET_PCT);
  const bidUsdClose = buckets
    .slice(closeRangeStart, MID_INDEX + 1)
    .reduce((a, b) => a + b, 0);
  const askUsdClose = buckets
    .slice(MID_INDEX, closeRangeEnd + 1)
    .reduce((a, b) => a + b, 0);
  const totalClose = bidUsdClose + askUsdClose;
  const bidShare = totalClose > 0 ? (bidUsdClose / totalClose) * 100 : 50;

  const symbol = book.symbol.replace("USDT", "").replace("USD", "");

  return {
    symbol,
    midUsd: mid,
    depthUsd: totalClose,
    bidShare,
    bidWallPrice,
    bidWallUsd: bidWallSize,
    bidWallPctFromSpot: bidWallPct,
    bidWallIndex: bidWallIdx,
    askWallPrice,
    askWallUsd: askWallSize,
    askWallPctFromSpot: askWallPct,
    askWallIndex: askWallIdx,
    depthBuckets: buckets,
  };
}

function fmtPrice(v: number): string {
  if (v >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (v >= 1) return v.toFixed(2);
  return v.toFixed(4);
}

function generateInsights(points: RadarPoint[]): string[] {
  if (points.length === 0) return [];
  const insights: string[] = [];

  const sorted = [...points].sort((a, b) => b.depthUsd - a.depthUsd);
  const deepest = sorted[0];
  insights.push(
    `${deepest.symbol} has the deepest order book with $${(deepest.depthUsd / 1e6).toFixed(1)}M sitting within ±2% of spot. It can absorb large orders without major slippage.`,
  );

  const biggestSupport = points.reduce(
    (max, p) => (p.bidWallUsd > max.bidWallUsd ? p : max),
    points[0],
  );
  insights.push(
    `Strongest long wall: ${biggestSupport.symbol} at $${fmtPrice(biggestSupport.bidWallPrice)} (${biggestSupport.bidWallPctFromSpot.toFixed(2)}% from spot) with $${(biggestSupport.bidWallUsd / 1e6).toFixed(2)}M in resting buy orders. Buyers plan to defend this level — expect bounces if price reaches it.`,
  );

  const biggestResistance = points.reduce(
    (max, p) => (p.askWallUsd > max.askWallUsd ? p : max),
    points[0],
  );
  insights.push(
    `Strongest short wall: ${biggestResistance.symbol} at $${fmtPrice(biggestResistance.askWallPrice)} (+${biggestResistance.askWallPctFromSpot.toFixed(2)}% from spot) with $${(biggestResistance.askWallUsd / 1e6).toFixed(2)}M in resting sell orders. This level will act as resistance — breakouts above need conviction.`,
  );

  const avgBidShare =
    points.reduce((a, p) => a + p.bidShare, 0) / points.length;
  if (avgBidShare > 53) {
    insights.push(
      `Aggregate book is bid-heavy (${avgBidShare.toFixed(0)}% bid share across all 10 markets). Buyers are stepping up more aggressively than sellers — short-term tilt is positive.`,
    );
  } else if (avgBidShare < 47) {
    insights.push(
      `Aggregate book is ask-heavy (${(100 - avgBidShare).toFixed(0)}% ask share across all 10 markets). Sellers are pressing — short-term tilt is negative.`,
    );
  } else {
    insights.push(
      `Aggregate book is balanced (${avgBidShare.toFixed(0)}% bid share). Neither side has clear conviction — expect ranging price action.`,
    );
  }

  const closeWalls = points.filter(
    (p) => Math.abs(p.bidWallPctFromSpot) < 1.0 || p.askWallPctFromSpot < 1.0,
  );
  if (closeWalls.length > 0) {
    insights.push(
      `Close-range walls (within 1% of spot): ${closeWalls
        .slice(0, 5)
        .map((p) => p.symbol)
        .join(
          ", ",
        )}. Watch these levels carefully — price will likely react immediately.`,
    );
  }

  return insights;
}

export async function fetchLiquidityRadar(): Promise<LiquidityHeatmapData> {
  const cached = cache.get("heatmap");
  if (cached) return cached;

  const tasks = RADAR_PAIRS.map(async (pair) => {
    let book = await fetchBinanceBook(pair);
    if (!book) book = await fetchCoinbaseBook(pair);
    return book ? bucketize(book) : null;
  });

  const points = (await Promise.all(tasks)).filter(
    (p): p is RadarPoint => p !== null,
  );

  if (points.length === 0) {
    return cache.getStale("heatmap") ?? {
      points: [],
      insights: [],
      generatedAt: Date.now(),
    };
  }

  /* Sort by depth desc so the user sees deepest markets first. */
  points.sort((a, b) => b.depthUsd - a.depthUsd);

  const data: LiquidityHeatmapData = {
    points,
    insights: generateInsights(points),
    generatedAt: Date.now(),
  };

  cache.set("heatmap", data);
  return data;
}
