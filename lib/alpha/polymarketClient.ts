/* ─────────────────────────────────────────────────────────────
   Polymarket Live Data Client
   - Free public API: https://clob.polymarket.com
   - No auth required for read
   - Filters for crypto-related markets
   - 5-minute cache (markets don't change tick-by-tick)
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
}

const CRYPTO_KEYWORDS = [
  "bitcoin", "btc",
  "ethereum", "eth",
  "solana", "sol",
  "crypto", "stablecoin",
  "ETF", "fed", "rate",
  "binance", "coinbase",
  "blackrock", "spot",
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

function buildSignalNote(yesPct: number, question: string): string {
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

export async function fetchLivePolymarketBets(): Promise<PolymarketBet[]> {
  const cached = cache.get("crypto");
  if (cached) return cached;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    /* Polymarket /markets returns paginated lists. We pull the
       first page of active markets, filter to crypto, and map to
       our PolymarketBet shape. */
    const res = await fetch(`${POLYMARKET_API}?next_cursor=`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      const stale = cache.getStale("crypto");
      return stale ?? [];
    }

    const json = (await res.json()) as PolyResponse;
    const markets = json.data ?? [];

    const cryptoMarkets = markets
      .filter((m) => m.active && !m.closed && !m.archived)
      .filter(isCryptoMarket)
      .slice(0, 6);

    const bets: PolymarketBet[] = cryptoMarkets
      .map((m, i) => {
        const yesToken = m.tokens?.find((t) => (t.outcome ?? "").toLowerCase() === "yes");
        const yesPriceRaw = num(yesToken?.price);
        /* Polymarket prices are 0-1 probabilities. Convert to %. */
        const yesPct = Math.max(0, Math.min(100, Math.round(yesPriceRaw * 100)));
        const volumeUsd = num(m.volume_24hr) || num(m.volume);

        return {
          id: m.condition_id ?? m.question_id ?? `poly-${i}`,
          question: m.question ?? "Untitled market",
          yesPct,
          volumeUsd,
          signalDirection: inferDirection(yesPct),
          signalNote: buildSignalNote(yesPct, m.question ?? ""),
        };
      })
      .filter((b) => b.volumeUsd > 0);

    if (bets.length > 0) {
      cache.set("crypto", bets);
      return bets;
    }

    /* No crypto markets returned — keep stale cache or empty. */
    const stale = cache.getStale("crypto");
    return stale ?? [];
  } catch {
    const stale = cache.getStale("crypto");
    return stale ?? [];
  } finally {
    clearTimeout(timer);
  }
}
