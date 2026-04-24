/* ─────────────────────────────────────────────────────────────
   GET /api/price-history?contract=0x..&chain=Polygon&days=1
   Returns unified price history for the chart.

   Source order:
   1. CoinGecko market_chart (if token indexed)
   2. DexScreener pair data (fallback — less granular)

   Response: { points: [[timestamp_ms, priceUsd], ...], source: "coingecko"|"dexscreener"|"none" }
   ───────────────────────────────────────────────────────────── */

import { NextRequest, NextResponse } from "next/server";
import { lookupTokenByContract, fetchPriceHistory } from "@/lib/coinGeckoClient";
import { debug } from "@/lib/constants";

const CONTRACT_REGEX = /^0x[a-fA-F0-9]{40}$/;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const contract = (searchParams.get("contract") || "").trim().toLowerCase();
    const chain = (searchParams.get("chain") || "").trim();
    const days = Math.min(Math.max(Number(searchParams.get("days") || 1), 1), 30);

    if (!CONTRACT_REGEX.test(contract)) {
      return NextResponse.json({ error: "Invalid contract address" }, { status: 400 });
    }
    if (!chain) {
      return NextResponse.json({ error: "Chain required" }, { status: 400 });
    }

    /* 1. Try CoinGecko */
    const cgLookup = await lookupTokenByContract(contract, chain);
    if (cgLookup?.coinGeckoId) {
      const history = await fetchPriceHistory(cgLookup.coinGeckoId, days);
      if (history && history.length > 1) {
        return NextResponse.json({
          source: "coingecko",
          points: history,
          meta: {
            coinGeckoId: cgLookup.coinGeckoId,
            currentPriceUsd: cgLookup.currentPriceUsd,
            priceChange24hPct: cgLookup.priceChange24hPct,
          },
        });
      }
    }

    /* 2. Fallback to DexScreener — build synthetic chart from their 24h sample */
    const dsPoints = await dexScreenerFallback(contract);
    if (dsPoints.length > 1) {
      return NextResponse.json({
        source: "dexscreener",
        points: dsPoints,
      });
    }

    return NextResponse.json({
      source: "none",
      points: [],
      message: "No price history available from any source",
    });
  } catch (e) {
    debug("Price history error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * DexScreener fallback: we don't get true timeseries from their public API,
 * but we can build a best-effort chart from the `priceChange` and current
 * price. This produces 4 synthetic points (now, -1h, -6h, -24h) so the
 * chart at least shows something. Crude — but better than empty state.
 */
async function dexScreenerFallback(contract: string): Promise<Array<[number, number]>> {
  try {
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${contract}`,
      { signal: AbortSignal.timeout(6_000) },
    );
    if (!res.ok) return [];
    const data = await res.json();
    const pairs: any[] = data?.pairs || [];
    if (!pairs.length) return [];

    // Use the highest-liquidity pair
    pairs.sort((a, b) => (b?.liquidity?.usd || 0) - (a?.liquidity?.usd || 0));
    const main = pairs[0];
    const currentPrice = Number(main?.priceUsd);
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) return [];

    const now = Date.now();
    const change5m = Number(main?.priceChange?.m5 || 0) / 100;
    const change1h = Number(main?.priceChange?.h1 || 0) / 100;
    const change6h = Number(main?.priceChange?.h6 || 0) / 100;
    const change24h = Number(main?.priceChange?.h24 || 0) / 100;

    // Work backwards from current price
    const points: Array<[number, number]> = [];
    points.push([now - 24 * 3600_000, currentPrice / (1 + change24h)]);
    points.push([now - 6 * 3600_000, currentPrice / (1 + change6h)]);
    points.push([now - 1 * 3600_000, currentPrice / (1 + change1h)]);
    points.push([now - 5 * 60_000, currentPrice / (1 + change5m)]);
    points.push([now, currentPrice]);

    // Filter any negative/NaN prices
    return points.filter(([, p]) => Number.isFinite(p) && p > 0);
  } catch {
    return [];
  }
}
