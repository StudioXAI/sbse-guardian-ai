/* ─────────────────────────────────────────────────────────────
   Polymarket Live Data
   - clob.polymarket.com (free public, no auth)
   - Returns ongoing AND closed markets in two arrays
   - Top 50 by volume in each
   - Includes direct market links
   - 5-minute cache
   ───────────────────────────────────────────────────────────── */

import { TtlCache } from "./cache";
import type { PolymarketBet, Direction } from "./types";

const CACHE_TTL_MS = 5 * 60 * 1000;
const POLYMARKET_API = "https://clob.polymarket.com/markets";
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_PAGES = 6; // up to ~3000 markets scanned

export interface PolymarketSplit {
  ongoing: PolymarketBet[];
  closed: PolymarketBet[];
}

const cache = new TtlCache<PolymarketSplit>(CACHE_TTL_MS);

interface PolyToken {
  token_id?: string;
  outcome?: string;
  price?: number | string;
  winner?: boolean;
}

interface PolyMarket {
  condition_id?: string;
  question?: string;
  question_id?: string;
  market_slug?: string;
  slug?: string;
  active?: boolean;
  closed?: boolean;
  archived?: boolean;
  tokens?: PolyToken[];
  volume?: number | string;
  volume_24hr?: number | string;
  volume_num?: number;
  end_date_iso?: string;
  category?: string;
  tags?: string[];
}

interface PolyResponse {
  data?: PolyMarket[];
  next_cursor?: string;
  count?: number;
}

function num(v: number | string | undefined): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const parsed = parseFloat(v);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function inferDirection(yesPct: number): Direction {
  if (yesPct >= 60) return "bullish";
  if (yesPct <= 40) return "bearish";
  return "neutral";
}

function buildLink(m: PolyMarket): string {
  const slug = m.market_slug ?? m.slug;
  if (slug) return `https://polymarket.com/market/${slug}`;
  if (m.condition_id) return `https://polymarket.com/market/${m.condition_id}`;
  return "https://polymarket.com";
}

function statusNote(yesPct: number, isClosed: boolean): string {
  if (isClosed) {
    if (yesPct >= 95) return "YES won decisively";
    if (yesPct >= 50) return "YES resolved (final)";
    if (yesPct <= 5) return "NO won decisively";
    return "NO resolved (final)";
  }
  if (yesPct >= 70) return `Strong YES lean — ${yesPct}% conviction`;
  if (yesPct >= 55) return `Mild YES lean — ${yesPct}% conviction`;
  if (yesPct >= 45) return `Toss-up — ${yesPct}% YES`;
  if (yesPct >= 30) return `Mild NO lean — ${100 - yesPct}% conviction`;
  return `Strong NO lean — ${100 - yesPct}% conviction`;
}

function toBet(m: PolyMarket, idx: number, isClosed: boolean): PolymarketBet | null {
  /* Defensive: accept markets with or without explicit YES outcome label.
     Some markets have differently-named outcomes; pick the highest-priced one. */
  if (!Array.isArray(m.tokens) || m.tokens.length === 0) return null;

  let yesPriceRaw = 0;
  /* First preference: explicit YES outcome. */
  const yesToken = m.tokens.find(
    (t) => (t.outcome ?? "").toLowerCase().trim() === "yes",
  );
  if (yesToken) {
    yesPriceRaw = num(yesToken.price);
  } else {
    /* Fallback: take the first token's price as a proxy. Most binary
       markets have two tokens; the first is typically the YES side. */
    yesPriceRaw = num(m.tokens[0]?.price);
  }

  /* For closed markets, check winner flag. */
  if (isClosed) {
    const winner = m.tokens.find((t) => t.winner === true);
    if (winner) {
      const isYesWinner =
        (winner.outcome ?? "").toLowerCase().trim() === "yes";
      yesPriceRaw = isYesWinner ? 1 : 0;
    }
  }

  const yesPct = Math.max(0, Math.min(100, Math.round(yesPriceRaw * 100)));
  const volumeUsd =
    num(m.volume_24hr) || num(m.volume) || num(m.volume_num);

  return {
    id: m.condition_id ?? m.question_id ?? `poly-${idx}`,
    question: m.question ?? "Untitled market",
    yesPct,
    volumeUsd,
    signalDirection: inferDirection(yesPct),
    signalNote: statusNote(yesPct, isClosed),
    link: buildLink(m),
    isClosed,
  };
}

async function fetchPage(cursor: string): Promise<PolyResponse | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const url = cursor
      ? `${POLYMARKET_API}?next_cursor=${encodeURIComponent(cursor)}`
      : POLYMARKET_API;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as PolyResponse;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchPolymarketSplit(): Promise<PolymarketSplit> {
  const cached = cache.get("split");
  if (cached) return cached;

  /* Walk paginated /markets up to MAX_PAGES collecting everything. */
  const allMarkets: PolyMarket[] = [];
  let cursor = "";
  for (let i = 0; i < MAX_PAGES; i++) {
    const page = await fetchPage(cursor);
    if (!page || !Array.isArray(page.data) || page.data.length === 0) break;
    allMarkets.push(...page.data);
    if (!page.next_cursor) break;
    cursor = page.next_cursor;
  }

  if (allMarkets.length === 0) {
    return cache.getStale("split") ?? { ongoing: [], closed: [] };
  }

  const ongoing: PolymarketBet[] = [];
  const closed: PolymarketBet[] = [];

  for (let i = 0; i < allMarkets.length; i++) {
    const m = allMarkets[i];
    if (m.archived === true) continue;

    const isClosed = m.closed === true;
    const bet = toBet(m, i, isClosed);
    if (!bet) continue;

    if (isClosed) {
      closed.push(bet);
    } else {
      ongoing.push(bet);
    }
  }

  /* Sort by volume desc, take top 50 each. */
  ongoing.sort((a, b) => b.volumeUsd - a.volumeUsd);
  closed.sort((a, b) => b.volumeUsd - a.volumeUsd);

  const split: PolymarketSplit = {
    ongoing: ongoing.slice(0, 50),
    closed: closed.slice(0, 50),
  };

  cache.set("split", split);
  return split;
}

/** Backward-compat for signal engine — returns ongoing only. */
export async function fetchLivePolymarketBets(): Promise<PolymarketBet[]> {
  const split = await fetchPolymarketSplit();
  return split.ongoing.slice(0, 8);
}
