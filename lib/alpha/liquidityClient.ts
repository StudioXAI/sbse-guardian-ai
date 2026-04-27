/* ─────────────────────────────────────────────────────────────
   Liquidity Map via DefiLlama
   - Free public API, no auth
   - Tracks TVL across 100+ DeFi protocols
   - Surfaces 24h liquidity flow direction (positive = inflow,
     negative = outflow)
   - Chain-level liquidity distribution
   - 5-minute cache (TVL doesn't change tick-by-tick)

   Trusted source rationale:
   - DefiLlama is the most widely cited DeFi data aggregator,
     used by The Block, CoinGecko, and major research desks.
   - Their methodology is open-source on GitHub.
   - https://defillama.com/docs/api
   ───────────────────────────────────────────────────────────── */

import { TtlCache } from "./cache";
import type { Direction } from "./types";

const CACHE_TTL_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 12_000;
const PROTOCOLS_API = "https://api.llama.fi/protocols";
const CHAINS_API = "https://api.llama.fi/v2/chains";

export interface LiquidityProtocol {
  name: string;
  symbol?: string;
  category: string;
  tvlUsd: number;
  change1h: number;
  change1d: number;
  change7d: number;
  chains: string[];
  url?: string;
  /** Inferred direction from 24h change. */
  direction: Direction;
  /** Score 0-100 based on absolute 24h move + TVL weight. */
  score: number;
}

export interface LiquidityChain {
  name: string;
  tvlUsd: number;
  change1d: number;
  change7d: number;
  /** Chain's share of total tracked TVL, 0-100. */
  sharePct: number;
}

export interface LiquidityMap {
  totalTvlUsd: number;
  topProtocols: LiquidityProtocol[];
  topInflows: LiquidityProtocol[];
  topOutflows: LiquidityProtocol[];
  chains: LiquidityChain[];
  generatedAt: number;
}

interface DefiLlamaProtocol {
  name?: string;
  symbol?: string;
  category?: string;
  tvl?: number;
  change_1h?: number;
  change_1d?: number;
  change_7d?: number;
  chains?: string[];
  url?: string;
  slug?: string;
}

interface DefiLlamaChain {
  name?: string;
  tvl?: number;
  tokenSymbol?: string;
  /** Chain TVL change can come back nested or flat depending on endpoint version. */
  change_1d?: number;
  change_7d?: number;
}

const cache = new TtlCache<LiquidityMap>(CACHE_TTL_MS);

function inferDirection(change1d: number): Direction {
  if (change1d > 2) return "bullish";
  if (change1d < -2) return "bearish";
  return "neutral";
}

function scoreProtocol(p: DefiLlamaProtocol): number {
  const tvl = p.tvl ?? 0;
  const move = Math.abs(p.change_1d ?? 0);
  /* Weight: bigger protocols + bigger moves = higher score. */
  const tvlScore = Math.min(40, Math.log10(Math.max(1, tvl / 1_000_000)) * 10);
  const moveScore = Math.min(60, move * 4);
  return Math.round(Math.min(100, tvlScore + moveScore));
}

function toProtocol(p: DefiLlamaProtocol): LiquidityProtocol | null {
  if (!p.name || typeof p.tvl !== "number" || p.tvl <= 0) return null;
  return {
    name: p.name,
    symbol: p.symbol,
    category: p.category ?? "Other",
    tvlUsd: p.tvl,
    change1h: p.change_1h ?? 0,
    change1d: p.change_1d ?? 0,
    change7d: p.change_7d ?? 0,
    chains: p.chains ?? [],
    url: p.url,
    direction: inferDirection(p.change_1d ?? 0),
    score: scoreProtocol(p),
  };
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchLiquidityMap(): Promise<LiquidityMap | null> {
  const cached = cache.get("map");
  if (cached) return cached;

  const [protocolsRaw, chainsRaw] = await Promise.all([
    fetchJson<DefiLlamaProtocol[]>(PROTOCOLS_API),
    fetchJson<DefiLlamaChain[]>(CHAINS_API),
  ]);

  if (!Array.isArray(protocolsRaw) || protocolsRaw.length === 0) {
    const stale = cache.getStale("map");
    return stale ?? null;
  }

  /* Map and filter, sort by TVL descending. */
  const allProtocols: LiquidityProtocol[] = [];
  for (const raw of protocolsRaw) {
    const p = toProtocol(raw);
    if (p) allProtocols.push(p);
  }
  allProtocols.sort((a, b) => b.tvlUsd - a.tvlUsd);

  const topProtocols = allProtocols.slice(0, 12);

  /* Inflows: protocols with biggest positive 24h change (and TVL > $50M
     to avoid noise from tiny protocols pumping). */
  const eligibleForFlows = allProtocols.filter((p) => p.tvlUsd > 50_000_000);
  const topInflows = [...eligibleForFlows]
    .sort((a, b) => b.change1d - a.change1d)
    .filter((p) => p.change1d > 0)
    .slice(0, 5);

  const topOutflows = [...eligibleForFlows]
    .sort((a, b) => a.change1d - b.change1d)
    .filter((p) => p.change1d < 0)
    .slice(0, 5);

  /* Chain distribution. */
  const chains: LiquidityChain[] = [];
  if (Array.isArray(chainsRaw)) {
    const totalChainTvl = chainsRaw.reduce((sum, c) => sum + (c.tvl ?? 0), 0);
    const sortedChains = [...chainsRaw]
      .filter((c) => typeof c.tvl === "number" && (c.tvl ?? 0) > 0 && c.name)
      .sort((a, b) => (b.tvl ?? 0) - (a.tvl ?? 0))
      .slice(0, 10);

    for (const c of sortedChains) {
      const tvl = c.tvl ?? 0;
      chains.push({
        name: c.name ?? "Unknown",
        tvlUsd: tvl,
        change1d: c.change_1d ?? 0,
        change7d: c.change_7d ?? 0,
        sharePct: totalChainTvl > 0 ? (tvl / totalChainTvl) * 100 : 0,
      });
    }
  }

  const totalTvl = allProtocols.reduce((sum, p) => sum + p.tvlUsd, 0);

  const map: LiquidityMap = {
    totalTvlUsd: totalTvl,
    topProtocols,
    topInflows,
    topOutflows,
    chains,
    generatedAt: Date.now(),
  };

  cache.set("map", map);
  return map;
}

/** Convert top liquidity flows into Alpha signals for the unified feed. */
export async function liquiditySignals(): Promise<
  Array<{
    id: string;
    text: string;
    direction: Direction;
    score: number;
    timestamp: number;
  }>
> {
  const map = await fetchLiquidityMap();
  if (!map) return [];

  const now = Date.now();
  const signals: Array<{
    id: string;
    text: string;
    direction: Direction;
    score: number;
    timestamp: number;
  }> = [];

  /* Most aggressive inflow → bullish signal */
  for (const p of map.topInflows.slice(0, 2)) {
    signals.push({
      id: `liq-in-${p.name}`,
      text: `${p.name} TVL +${p.change1d.toFixed(1)}% in 24h ($${(p.tvlUsd / 1e9).toFixed(2)}B locked) — capital flowing in`,
      direction: "bullish",
      score: p.score,
      timestamp: now - 5 * 60_000,
    });
  }

  /* Most aggressive outflow → bearish signal */
  for (const p of map.topOutflows.slice(0, 2)) {
    signals.push({
      id: `liq-out-${p.name}`,
      text: `${p.name} TVL ${p.change1d.toFixed(1)}% in 24h ($${(p.tvlUsd / 1e9).toFixed(2)}B locked) — capital flight`,
      direction: "bearish",
      score: p.score,
      timestamp: now - 7 * 60_000,
    });
  }

  return signals;
}
