/* ─────────────────────────────────────────────────────────────
   Polymarket Live Data Client
   - Free public API: https://clob.polymarket.com
   - No auth required for read
   - Tries crypto-related markets first, falls back to top markets
     by 24h volume across any category — better to show real
     high-conviction signals than nothing.
   - 5-minute cache.
   ───────────────────────────────────────────────────────────── */

import { TtlCache } from "./cache";
import type { PolymarketBet, Direction } from "./types";

const CACHE_TTL_MS = 5 * 60 * 1000;
const POLYMARKET_API = "https://clob.polymarket.com/markets";
const REQUEST_TIMEOUT_MS = 10_000;

const cache = new TtlCache<PolymarketBet[]>(CACHE_TTL_MS);

interface PolyToken {
  token_id?: string;
  outcome?: string;
  price?: number | string;
}

interface PolyMarket {
  condition_id?: string;
  question?: string;
  question_id?: string;
  active?: boolean;
  closed?: boolean;
  archived?: boolean;
  enable_order_book?: boolean;
  tokens?: PolyToken[];
  volume?: number | string;
  volume_24hr?: number | string;
  end_date_iso?: string;
  category?: string;
  tags?: string[];
}

interface PolyResponse {
  data?: PolyMarket[];
  next_cursor?: string;
  count?: number;
}

const CRYPTO_KEYWORDS = [
  "bitcoin", "btc",
  "ethereum", "eth",
  "solana", "sol",
  "crypto", "stablecoin",
  "etf", "fed", "rate", "fomc",
  "binance", "coinbase",
  "blackrock", "spot",
  "halving", "all-time high",
  "altcoin", "memecoin",
  "trump", "election", // crypto-adjacent macro
];

function isCryptoMarket(m: PolyMarket): boolean {
  const text = `${m.question ?? ""} ${m.category ?? ""} ${(m.tags ?? []).join(" ")}`.toLowerCase();
  return CRYPTO_KEYWORDS.some((k) => text.includes(k));
}

function inferDirection(yesPct: number): Direction {
  if (yesPct >= 65) return "bullish";
  if (yesPct <= 35) return "bearish";
  return "neutral";
}

function buildSignalNote(yesPct: number): string {
  if (yesPct >= 65) {
    return `Strong real-money consensus — bullish signal. ${yesPct}% of bettors say YES.`;
  }
  if (yesPct <= 35) {
    return `Market skeptical — bearish signal. Only ${yesPct}% say YES.`;
  }
  return `Mixed signals — ${yesPct}% YES, no clear edge.`;
}

function num(v: number | string | undefined): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const parsed = parseFloat(v);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toBet(m: PolyMarket, idx: number): PolymarketBet | null {
  const yesToken = m.tokens?.find(
    (t) => (t.outcome ?? "").toLowerCase() === "yes",
  );
  const yesPriceRaw = num(yesToken?.price);
  /* Skip markets with no live YES price — they're settled or stale. */
  if (yesPriceRaw === 0) return null;

  const yesPct = Math.max(0, Math.min(100, Math.round(yesPriceRaw * 100)));
  const volumeUsd = num(m.volume_24hr) || num(m.volume);

  return {
    id: m.condition_id ?? m.question_id ?? `poly-${idx}`,
    question: m.question ?? "Untitled market",
    yesPct,
    volumeUsd,
    signalDirection: inferDirection(yesPct),
    signalNote: buildSignalNote(yesPct),
  };
}

export async function fetchLivePolymarketBets(): Promise<PolymarketBet[]> {
  const cached = cache.get("crypto");
  if (cached) return cached;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(POLYMARKET_API, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      const stale = cache.getStale("crypto");
      return stale ?? [];
    }

    const json = (await res.json()) as PolyResponse;
    const markets = json.data ?? [];

    /* Filter to active, non-closed, non-archived markets. We allow
       `active === undefined` since some endpoints omit the field. */
    const activeMarkets = markets.filter(
      (m) =>
        m.active !== false &&
        m.closed !== true &&
        m.archived !== true &&
        Array.isArray(m.tokens) &&
        m.tokens.length > 0,
    );

    /* First try: crypto-relevant markets, sorted by 24h volume. */
    const cryptoBets = activeMarkets
      .filter(isCryptoMarket)
      .map((m, i) => toBet(m, i))
      .filter((b): b is PolymarketBet => b !== null && b.volumeUsd > 0)
      .sort((a, b) => b.volumeUsd - a.volumeUsd)
      .slice(0, 50);

    if (cryptoBets.length >= 20) {
      cache.set("crypto", cryptoBets);
      return cryptoBets;
    }

    /* Fall back: top markets by 24h volume across any category. */
    const topBets = activeMarkets
      .map((m, i) => toBet(m, i))
      .filter((b): b is PolymarketBet => b !== null && b.volumeUsd > 50_000)
      .sort((a, b) => b.volumeUsd - a.volumeUsd)
      .slice(0, 50);

    /* Merge crypto + top, dedup by id. */
    const merged: PolymarketBet[] = [...cryptoBets];
    const seen = new Set(merged.map((b) => b.id));
    for (const b of topBets) {
      if (merged.length >= 50) break;
      if (!seen.has(b.id)) {
        merged.push(b);
        seen.add(b.id);
      }
    }

    if (merged.length > 0) {
      cache.set("crypto", merged);
      return merged;
    }

    const stale = cache.getStale("crypto");
    return stale ?? [];
  } catch {
    const stale = cache.getStale("crypto");
    return stale ?? [];
  } finally {
    clearTimeout(timer);
  }
}
