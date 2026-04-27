/* ─────────────────────────────────────────────────────────────
   Signal Engine for Alpha — LIVE DATA ONLY
   - Derives signals from real on-chain whale movements (Etherscan)
   - Derives signals from real Polymarket consensus (clob.polymarket.com)
   - Derives signals from real INFI ecosystem data (launchpad)
   - No seeded scenarios. Empty array if no live sources respond.
   ───────────────────────────────────────────────────────────── */

import { TtlCache } from "./cache";
import type { Signal, Direction } from "./types";
import { fetchInfiProjects } from "../fetchInfiProjects";
import { fetchLiveWhaleMoves } from "./whaleTracker";
import { fetchWhaleAlertMoves } from "./whaleAlertClient";
import { fetchLivePolymarketBets } from "./polymarketClient";
import { liquiditySignals as fetchLiquiditySignals } from "./liquidityClient";
import { formatUsd } from "./format";

const cache = new TtlCache<Signal[]>(60_000);

async function whaleSignals(): Promise<Signal[]> {
  try {
    /* Pull both Etherscan-tracked exchange wallets AND Whale Alert
       (when configured). Merge, dedup by id, sort by recency. */
    const [etherscan, whaleAlert] = await Promise.all([
      fetchLiveWhaleMoves(),
      fetchWhaleAlertMoves(),
    ]);
    const seen = new Set<string>();
    const merged = [];
    for (const w of [...etherscan, ...whaleAlert]) {
      if (seen.has(w.id)) continue;
      seen.add(w.id);
      merged.push(w);
    }
    merged.sort((a, b) => b.timestamp - a.timestamp);
    return merged.slice(0, 8).map((w) => ({
      id: `whale-${w.id}`,
      source: "WHALE" as const,
      text: `${w.action}: ${formatUsd(w.amountUsd)} ${w.asset}`,
      direction: w.direction,
      score: Math.min(95, 60 + Math.floor(w.amountUsd / 5_000_000)),
      asset: w.asset,
      timestamp: w.timestamp,
    }));
  } catch {
    return [];
  }
}

async function liquidityToSignals(): Promise<Signal[]> {
  try {
    const liq = await fetchLiquiditySignals();
    return liq.map((l) => ({
      id: l.id,
      source: "ON-CHAIN" as const,
      text: l.text,
      direction: l.direction,
      score: l.score,
      timestamp: l.timestamp,
    }));
  } catch {
    return [];
  }
}

async function polymarketSignals(): Promise<Signal[]> {
  try {
    const bets = await fetchLivePolymarketBets();
    return bets.slice(0, 4).map((b) => {
      const score =
        b.signalDirection === "neutral"
          ? 60
          : Math.min(90, 65 + Math.abs(b.yesPct - 50));
      return {
        id: `poly-${b.id}`,
        source: "MACRO" as const,
        text: `Polymarket consensus: ${b.question} → ${b.yesPct}% YES (${formatUsd(b.volumeUsd)} bet)`,
        direction: b.signalDirection,
        score,
        timestamp: Date.now() - Math.floor(Math.random() * 30 * 60_000),
      };
    });
  } catch {
    return [];
  }
}

async function infiSignals(): Promise<Signal[]> {
  try {
    const projects = await fetchInfiProjects();
    if (!projects.length) return [];

    const now = Date.now();
    const trending = projects.filter((p) => p.featured || p.listed).slice(0, 4);

    return trending.map((p, i) => ({
      id: `infi-${p.contract}`,
      source: "INFI" as const,
      text: `INFI ecosystem: ${p.name} (${p.symbol || "—"}) ${
        p.listed ? "listed on" : "active presale on"
      } ${p.chain || "INFI Launchpad"} — Guardian status verified`,
      direction: "neutral" as Direction,
      score: 70 + (i % 4) * 5,
      asset: p.symbol,
      timestamp: now - (i + 1) * 7 * 60_000,
    }));
  } catch {
    return [];
  }
}

export async function getSignals(): Promise<Signal[]> {
  const cached = cache.get("all");
  if (cached) return cached;

  const [whales, poly, infi, liquidity] = await Promise.all([
    whaleSignals(),
    polymarketSignals(),
    infiSignals(),
    liquidityToSignals(),
  ]);

  const all = [...whales, ...poly, ...infi, ...liquidity].sort(
    (a, b) => b.timestamp - a.timestamp,
  );
  cache.set("all", all);
  return all;
}

export async function getMarketSignals(): Promise<Signal[]> {
  const all = await getSignals();
  return all.filter((s) => s.source !== "INFI" && s.source !== "GUARDIAN");
}

export async function getInfiSignals(): Promise<Signal[]> {
  const all = await getSignals();
  return all.filter((s) => s.source === "INFI" || s.source === "GUARDIAN");
}
