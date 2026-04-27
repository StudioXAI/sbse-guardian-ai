"use client";

import { useEffect, useMemo, useState } from "react";
import type { PolymarketBet } from "@/lib/alpha/types";
import { alphaGet } from "@/lib/alpha/client";
import { directionFillVar } from "./DirectionBadge";
import { formatUsd } from "@/lib/alpha/format";
import { computeMarketImpact } from "@/lib/alpha/marketImpactEngine";
import type { CryptoRow, StockRow } from "@/lib/alpha/topMarketsClient";

interface MarketsResp {
  crypto: CryptoRow[];
  stocks: StockRow[];
  generatedAt: number;
}

export default function PolymarketSection() {
  const [bets, setBets] = useState<PolymarketBet[] | null>(null);
  const [markets, setMarkets] = useState<MarketsResp | null>(null);
  const [filter, setFilter] = useState<"all" | "yes" | "no" | "neutral">("all");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [b, m] = await Promise.all([
        alphaGet<PolymarketBet[]>("/api/alpha/polymarket"),
        alphaGet<MarketsResp>("/api/alpha/markets"),
      ]);
      if (cancelled) return;
      setBets(b ?? []);
      setMarkets(m ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const impact = useMemo(
    () => (bets ? computeMarketImpact(bets) : null),
    [bets],
  );

  const filteredBets = useMemo(() => {
    if (!bets) return [];
    if (filter === "all") return bets;
    if (filter === "yes") return bets.filter((b) => b.yesPct >= 60);
    if (filter === "no") return bets.filter((b) => b.yesPct <= 40);
    return bets.filter((b) => b.yesPct > 40 && b.yesPct < 60);
  }, [bets, filter]);

  const topGainers = (markets?.crypto ?? [])
    .filter((c) => c.change24hPct > 0)
    .sort((a, b) => b.change24hPct - a.change24hPct)
    .slice(0, 5);
  const topLosers = (markets?.crypto ?? [])
    .filter((c) => c.change24hPct < 0)
    .sort((a, b) => a.change24hPct - b.change24hPct)
    .slice(0, 5);

  return (
    <div className="space-y-5">
      {/* Source banner */}
      <div
        className="card p-4 flex items-center justify-between flex-wrap gap-2"
        style={{ borderLeft: "3px solid var(--accent)" }}
      >
        <div>
          <div className="label-xs" style={{ color: "var(--accent-soft)" }}>
            Polymarket · real-money prediction markets
          </div>
          <div className="text-[12px] mt-1" style={{ color: "var(--fg-muted)" }}>
            {bets === null
              ? "Loading…"
              : `${bets.length} active markets · sorted by 24h volume`}
          </div>
        </div>
        <a
          href="https://polymarket.com"
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-1.5 rounded-md font-mono"
          style={{
            background: "var(--bg-subtle)",
            color: "var(--fg-muted)",
            border: "1px solid var(--border)",
            fontSize: "11px",
            letterSpacing: "0.05em",
            textDecoration: "none",
          }}
        >
          polymarket.com ↗
        </a>
      </div>

      {/* Market impact summary */}
      {impact && (
        <div className="grid gap-3 md:grid-cols-2">
          <ImpactCard
            label="Crypto market impact"
            score={impact.cryptoImpact}
            direction={impact.cryptoDirection}
            volumeUsd={impact.cryptoVolumeUsd}
            count={impact.cryptoRelevant.length}
            narrative={impact.cryptoNarrative}
          />
          <ImpactCard
            label="Stock market impact"
            score={impact.stockImpact}
            direction={impact.stockDirection}
            volumeUsd={impact.stockVolumeUsd}
            count={impact.stockRelevant.length}
            narrative={impact.stockNarrative}
          />
        </div>
      )}

      {/* Crypto top movers reference */}
      {markets && markets.crypto.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          <MoverList title="Top crypto gainers · 24h" rows={topGainers} positive />
          <MoverList title="Top crypto losers · 24h" rows={topLosers} positive={false} />
        </div>
      )}

      {/* Bets list with filters */}
      <div className="card p-5">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div className="label-sm" style={{ color: "var(--fg-muted)" }}>
            Top 50 markets · {filteredBets.length} shown
          </div>
          <div
            className="inline-flex p-0.5 rounded-md"
            style={{
              background: "var(--bg-subtle)",
              border: "1px solid var(--border)",
            }}
          >
            {(
              [
                ["all", "All"],
                ["yes", "YES leaning"],
                ["no", "NO leaning"],
                ["neutral", "Neutral"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                className="px-2.5 py-1 rounded font-mono"
                style={{
                  background: filter === k ? "var(--accent)" : "transparent",
                  color: filter === k ? "#fff" : "var(--fg-muted)",
                  fontSize: "10px",
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {bets === null && (
          <div className="text-sm" style={{ color: "var(--fg-dim)" }}>
            Loading Polymarket consensus…
          </div>
        )}

        {bets && filteredBets.length === 0 && (
          <div
            className="p-4 rounded-lg"
            style={{ background: "var(--bg-elevated)" }}
          >
            <div
              className="font-mono text-[11px] mb-2"
              style={{ color: "var(--fg-dim)", letterSpacing: "0.05em" }}
            >
              NO MARKETS MATCH FILTER
            </div>
            <p className="text-[13px]" style={{ color: "var(--fg-muted)" }}>
              Try a different filter, or refresh — Polymarket markets shift
              fast.
            </p>
          </div>
        )}

        {bets && filteredBets.length > 0 && (
          <div
            className="overflow-y-auto space-y-2"
            style={{ maxHeight: "560px" }}
          >
            {filteredBets.map((b) => (
              <BetRow key={b.id} bet={b} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ImpactCard({
  label,
  score,
  direction,
  volumeUsd,
  count,
  narrative,
}: {
  label: string;
  score: number;
  direction: "bullish" | "bearish" | "neutral";
  volumeUsd: number;
  count: number;
  narrative: string;
}) {
  const fill = directionFillVar(direction);
  const borderColor =
    direction === "bullish"
      ? "var(--success)"
      : direction === "bearish"
      ? "var(--danger)"
      : "var(--accent)";
  const dirLabel =
    direction === "bullish"
      ? "POSITIVE"
      : direction === "bearish"
      ? "NEGATIVE"
      : "NEUTRAL";

  return (
    <div
      className="card p-4"
      style={{ borderLeft: `3px solid ${borderColor}` }}
    >
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <div className="label-xs" style={{ color: "var(--fg-muted)" }}>
          {label}
        </div>
        <span
          className="text-[10px] px-2 py-0.5 rounded-full font-mono"
          style={{
            background:
              direction === "bullish"
                ? "var(--success-dim)"
                : direction === "bearish"
                ? "var(--danger-dim)"
                : "var(--accent-dim)",
            color: fill,
            letterSpacing: "0.05em",
          }}
        >
          {dirLabel}
        </span>
      </div>

      <div className="flex items-baseline gap-2 mb-2">
        <span
          className="font-mono font-medium"
          style={{ fontSize: "26px", color: fill, letterSpacing: "-0.02em" }}
        >
          {score >= 0 ? "+" : ""}
          {score}
        </span>
        <span className="text-[11px]" style={{ color: "var(--fg-dim)" }}>
          impact score
        </span>
      </div>

      {/* Bar from -100 to +100 */}
      <div
        className="relative h-[3px] rounded-full mb-3"
        style={{ background: "var(--border)" }}
      >
        <div
          className="absolute top-0 h-full"
          style={{
            background: "var(--fg-dim)",
            left: "50%",
            width: "1px",
          }}
        />
        <div
          className="absolute top-0 h-full rounded-full"
          style={{
            background: fill,
            left: score >= 0 ? "50%" : `${50 + score / 2}%`,
            width: `${Math.abs(score) / 2}%`,
          }}
        />
      </div>

      <p className="text-[12px] leading-relaxed mb-2" style={{ color: "var(--fg)" }}>
        {narrative}
      </p>
      <div className="text-[10px]" style={{ color: "var(--fg-dim)" }}>
        {count} relevant {count === 1 ? "market" : "markets"} · {formatUsd(volumeUsd)} total volume
      </div>
    </div>
  );
}

function MoverList({
  title,
  rows,
  positive,
}: {
  title: string;
  rows: Array<{ symbol: string; name: string; change24hPct: number; priceUsd: number; imageUrl?: string }>;
  positive: boolean;
}) {
  const color = positive ? "var(--success)" : "var(--danger)";
  return (
    <div className="card p-4">
      <div
        className="label-xs mb-3 flex items-center justify-between"
        style={{ color: "var(--fg-muted)" }}
      >
        <span>{title}</span>
        <span style={{ color }}>{positive ? "↑" : "↓"}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-[12px]" style={{ color: "var(--fg-dim)" }}>
          No data right now.
        </p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div
              key={r.symbol}
              className="flex items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {r.imageUrl && (
                  <img src={r.imageUrl} alt="" width={16} height={16} style={{ borderRadius: "50%" }} />
                )}
                <span
                  className="font-medium truncate"
                  style={{ color: "var(--fg)", fontSize: "12px" }}
                >
                  {r.symbol}
                </span>
                <span
                  className="truncate"
                  style={{ color: "var(--fg-dim)", fontSize: "10px" }}
                >
                  {r.name}
                </span>
              </div>
              <span
                className="font-mono flex-shrink-0"
                style={{ color, fontSize: "11px" }}
              >
                {r.change24hPct >= 0 ? "+" : ""}
                {r.change24hPct.toFixed(2)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BetRow({ bet }: { bet: PolymarketBet }) {
  const fill = directionFillVar(bet.signalDirection);
  const borderColor =
    bet.signalDirection === "bullish"
      ? "var(--success)"
      : bet.signalDirection === "bearish"
      ? "var(--danger)"
      : "var(--accent)";
  const status =
    bet.yesPct >= 60 ? "YES" : bet.yesPct <= 40 ? "NO" : "TOSS-UP";
  const statusColor =
    bet.yesPct >= 60
      ? "var(--success)"
      : bet.yesPct <= 40
      ? "var(--danger)"
      : "var(--fg-muted)";

  return (
    <div
      className="p-3 rounded-lg"
      style={{
        background: "var(--bg-elevated)",
        borderLeft: `3px solid ${borderColor}`,
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <p
          className="text-[13px] font-medium leading-snug flex-1"
          style={{ color: "var(--fg)" }}
        >
          {bet.question}
        </p>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span
            className="text-[9px] px-1.5 py-0.5 rounded font-mono"
            style={{
              background:
                bet.yesPct >= 60
                  ? "var(--success-dim)"
                  : bet.yesPct <= 40
                  ? "var(--danger-dim)"
                  : "var(--bg-subtle)",
              color: statusColor,
              letterSpacing: "0.05em",
            }}
          >
            {status}
          </span>
          <div className="text-right">
            <div
              className="font-mono font-medium"
              style={{ fontSize: "14px", color: fill }}
            >
              {bet.yesPct}%
            </div>
            <div className="text-[9px]" style={{ color: "var(--fg-dim)" }}>
              YES
            </div>
          </div>
        </div>
      </div>

      <div
        className="h-[2px] rounded-full mb-2"
        style={{ background: "var(--border)" }}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${bet.yesPct}%`, background: fill }}
        />
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-[11px]" style={{ color: "var(--fg-muted)" }}>
          {bet.signalNote}
        </span>
        <span className="font-mono text-[10px]" style={{ color: "var(--fg-dim)" }}>
          {formatUsd(bet.volumeUsd)} · 24h
        </span>
      </div>
    </div>
  );
}
