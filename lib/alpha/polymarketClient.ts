/* ─────────────────────────────────────────────────────────────
   Polymarket Live Data — gamma-api edition

   Three feeds, each cached for 90 seconds to match the global
   auto-refresh cadence:

   - ongoing  : top 50 active markets, sorted by 24h volume
   - closed   : top 50 most-recently-closed markets (sorted by
                closedTime descending, newest closures first)
   - trending : top 50 by 24h volume — markets with the most
                recent activity, regardless of total volume

   Server-side filters guarantee no cross-leakage between active
   and closed lists. Public/no-auth.
   ───────────────────────────────────────────────────────────── */

import { TtlCache } from "./cache";
import type { PolymarketBet, Direction } from "./types";

const CACHE_TTL_MS = 90_000; // 90s — matches global auto-refresh
const REQUEST_TIMEOUT_MS = 12_000;

const GAMMA_BASE = "https://gamma-api.polymarket.com/markets";

/* Server-side ordering keeps the wire payload small and ensures
   we get the right markets in the first place rather than fetching
   200 and re-sorting client-side. */
const ONGOING_URL =
  `${GAMMA_BASE}?active=true&closed=false&archived=false` +
  `&order=volume24hr&ascending=false&limit=200`;

const CLOSED_NEWEST_URL =
  `${GAMMA_BASE}?closed=true&archived=false` +
  `&order=closedTime&ascending=false&limit=100`;

const TRENDING_URL =
  `${GAMMA_BASE}?active=true&closed=false&archived=false` +
  `&order=volume24hr&ascending=false&limit=100`;

export interface PolymarketSplit {
  ongoing: PolymarketBet[];
  closed: PolymarketBet[];
  trending: PolymarketBet[];
  generatedAt: number;
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
  liquidity?: string | number;
  liquidityNum?: number;
  closed?: boolean;
  archived?: boolean;
  active?: boolean;
  endDate?: string;
  closedTime?: string;
  commentCount?: number;
  /** Some payloads include this nested. */
  events?: Array<{ commentCount?: number }>;
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
  const totalVolume = num(m.volume) || num(m.volumeNum);
  const vol24h = num(m.volume24hr);
  /* Pick the most informative volume number for the row. For closed
     markets total > 24h. For active markets either works but 24h is
     more "live". */
  const volumeUsd = isClosed ? totalVolume || vol24h : vol24h || totalVolume;

  /* Approximate YES/NO pool sizes from total volume × probability split.
     This isn't the EXACT bet size on each side (which would require
     per-market position queries), but it's the closest fair approximation
     and useful for "biggest bets on YES/NO" framing. */
  const liquidityUsd = num(m.liquidity) || num(m.liquidityNum);
  const refForPools = totalVolume || vol24h;
  const yesPoolUsd = refForPools > 0 ? Math.round((refForPools * yesPct) / 100) : 0;
  const noPoolUsd = refForPools > 0 ? Math.round((refForPools * (100 - yesPct)) / 100) : 0;

  /* Comment count — try direct field first, then nested events array. */
  let commentCount = m.commentCount ?? 0;
  if (!commentCount && Array.isArray(m.events) && m.events.length > 0) {
    commentCount = m.events[0]?.commentCount ?? 0;
  }

  return {
    id: m.id ?? m.conditionId ?? `gamma-${idx}`,
    question: m.question ?? "Untitled market",
    yesPct,
    volumeUsd,
    signalDirection: inferDirection(yesPct),
    signalNote: statusNote(yesPct, isClosed),
    link: buildLink(m),
    isClosed,
    endDate: isClosed ? m.closedTime ?? m.endDate : m.endDate,
    volume24hUsd: vol24h,
    commentCount,
    yesPoolUsd,
    noPoolUsd,
    liquidityUsd: liquidityUsd > 0 ? liquidityUsd : undefined,
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

  /* Fetch all three feeds in parallel. Server-side ordering means
     each feed already comes pre-sorted; we just convert and trim. */
  const [ongoingRaw, closedRaw, trendingRaw] = await Promise.all([
    fetchGamma(ONGOING_URL),
    fetchGamma(CLOSED_NEWEST_URL),
    fetchGamma(TRENDING_URL),
  ]);

  const ongoing: PolymarketBet[] = ongoingRaw
    .map((m, i) => gammaToBet(m, i, false))
    .filter((b): b is PolymarketBet => b !== null && b.volumeUsd > 0)
    .slice(0, 50);

  /* Closed list is already sorted newest-first by the server. We don't
     filter on volume — newest closures matter even at low volume. */
  const closed: PolymarketBet[] = closedRaw
    .map((m, i) => gammaToBet(m, i, true))
    .filter((b): b is PolymarketBet => b !== null)
    .slice(0, 50);

  /* Trending uses the same source as ongoing (24h volume desc) but we
     dedupe IDs that are also in ongoing's top 5 since those appear at
     the top of the Ongoing tab already and would be redundant. We
     prefer markets that aren't yet visible elsewhere. */
  const ongoingTopIds = new Set(ongoing.slice(0, 5).map((b) => b.id));
  const trending: PolymarketBet[] = trendingRaw
    .map((m, i) => gammaToBet(m, i, false))
    .filter(
      (b): b is PolymarketBet =>
        b !== null && b.volumeUsd > 0 && !ongoingTopIds.has(b.id),
    )
    .slice(0, 50);

  const split: PolymarketSplit = {
    ongoing,
    closed,
    trending,
    generatedAt: Date.now(),
  };

  if (ongoing.length > 0 || closed.length > 0 || trending.length > 0) {
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
