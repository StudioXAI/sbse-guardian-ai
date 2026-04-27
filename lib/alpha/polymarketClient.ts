/* ─────────────────────────────────────────────────────────────
   Polymarket Live Data — gamma-api edition
   - gamma-api.polymarket.com supports server-side filters for
     active/closed/archived which is more reliable than the
     clob.polymarket.com/markets endpoint
   - Two separate fetches: ongoing (top 50 trending by 24h volume)
     and closed (top 50 settled by total volume)
   - Public/no-auth, 5-minute cache
   ───────────────────────────────────────────────────────────── */

import { TtlCache } from "./cache";
import type { PolymarketBet, Direction } from "./types";

const CACHE_TTL_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 12_000;

/* Fetch wider than 50 so we can sort client-side and trim to top 50.
   Gamma's max limit is 500, but 200 is plenty and faster. */
const ONGOING_URL =
  "https://gamma-api.polymarket.com/markets" +
  "?active=true&closed=false&archived=false&limit=200";

const CLOSED_URL =
  "https://gamma-api.polymarket.com/markets" +
  "?closed=true&archived=false&limit=200";

export interface PolymarketSplit {
  ongoing: PolymarketBet[];
  closed: PolymarketBet[];
}

const cache = new TtlCache<PolymarketSplit>(CACHE_TTL_MS);

interface GammaMarket {
  id?: string;
  conditionId?: string;
  question?: string;
  slug?: string;
  /** JSON-encoded array string, e.g. '["Yes","No"]' */
  outcomes?: string;
  /** JSON-encoded array string, e.g. '["0.65","0.35"]' */
  outcomePrices?: string;
  volume?: string | number;
  volume24hr?: string | number;
  volumeNum?: number;
  closed?: boolean;
  archived?: boolean;
  active?: boolean;
  endDate?: string;
}

function num(v: string | number | undefined): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const parsed = parseFloat(v);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function parseJsonArray(s: string | undefined): string[] {
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    /* malformed gamma response — treat as no data. */
  }
  return [];
}

function buildLink(m: GammaMarket): string {
  if (m.slug) return `https://polymarket.com/market/${m.slug}`;
  if (m.conditionId) return `https://polymarket.com/market/${m.conditionId}`;
  return "https://polymarket.com";
}

function inferDirection(yesPct: number): Direction {
  if (yesPct >= 60) return "bullish";
  if (yesPct <= 40) return "bearish";
  return "neutral";
}

function statusNote(yesPct: number, isClosed: boolean): string {
  if (isClosed) {
    if (yesPct >= 95) return "YES won decisively";
    if (yesPct >= 50) return "YES — final outcome";
    if (yesPct <= 5) return "NO won decisively";
    return "NO — final outcome";
  }
  if (yesPct >= 70) return `Strong YES lean — ${yesPct}% conviction`;
  if (yesPct >= 55) return `Mild YES lean — ${yesPct}% conviction`;
  if (yesPct >= 45) return `Toss-up — ${yesPct}% YES`;
  if (yesPct >= 30) return `Mild NO lean — ${100 - yesPct}% conviction`;
  return `Strong NO lean — ${100 - yesPct}% conviction`;
}

function gammaToBet(
  m: GammaMarket,
  idx: number,
  isClosed: boolean,
): PolymarketBet | null {
  const outcomes = parseJsonArray(m.outcomes);
  const prices = parseJsonArray(m.outcomePrices);
  if (outcomes.length === 0 || prices.length === 0) return null;

  /* Identify YES outcome and its price. Some markets have non-binary
     labels (e.g. "Higher" / "Lower"). Fall back to first outcome. */
  let yesPriceRaw = 0;
  const yesIdx = outcomes.findIndex(
    (o) => o.toLowerCase().trim() === "yes",
  );
  if (yesIdx >= 0 && yesIdx < prices.length) {
    yesPriceRaw = parseFloat(prices[yesIdx]) || 0;
  } else {
    yesPriceRaw = parseFloat(prices[0]) || 0;
  }

  const yesPct = Math.max(0, Math.min(100, Math.round(yesPriceRaw * 100)));
  const volumeUsd =
    num(m.volume24hr) || num(m.volume) || num(m.volumeNum);

  return {
    id: m.id ?? m.conditionId ?? `gamma-${idx}`,
    question: m.question ?? "Untitled market",
    yesPct,
    volumeUsd,
    signalDirection: inferDirection(yesPct),
    signalNote: statusNote(yesPct, isClosed),
    link: buildLink(m),
    isClosed,
  };
}

async function fetchGamma(url: string): Promise<GammaMarket[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json) ? (json as GammaMarket[]) : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchPolymarketSplit(): Promise<PolymarketSplit> {
  const cached = cache.get("split");
  if (cached) return cached;

  /* Fetch both feeds in parallel — server-side filter guarantees
     no closed markets leak into the ongoing list and vice versa. */
  const [ongoingRaw, closedRaw] = await Promise.all([
    fetchGamma(ONGOING_URL),
    fetchGamma(CLOSED_URL),
  ]);

  /* Convert and sort by 24h volume (ongoing) / total volume (closed)
     client-side so we get truly trending markets at the top. */
  const ongoing: PolymarketBet[] = ongoingRaw
    .map((m, i) => gammaToBet(m, i, false))
    .filter((b): b is PolymarketBet => b !== null && b.volumeUsd > 0)
    .sort((a, b) => b.volumeUsd - a.volumeUsd)
    .slice(0, 50);

  const closed: PolymarketBet[] = closedRaw
    .map((m, i) => gammaToBet(m, i, true))
    .filter((b): b is PolymarketBet => b !== null)
    .sort((a, b) => b.volumeUsd - a.volumeUsd)
    .slice(0, 50);

  const split: PolymarketSplit = { ongoing, closed };

  if (ongoing.length > 0 || closed.length > 0) {
    cache.set("split", split);
    return split;
  }
  return cache.getStale("split") ?? split;
}

/** Backward-compat for the signal engine. */
export async function fetchLivePolymarketBets(): Promise<PolymarketBet[]> {
  const split = await fetchPolymarketSplit();
  return split.ongoing.slice(0, 8);
}
