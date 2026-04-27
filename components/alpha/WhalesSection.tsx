"use client";

import { useEffect, useMemo, useState } from "react";
import type { WhaleMove } from "@/lib/alpha/types";
import { alphaGet } from "@/lib/alpha/client";
import { directionFillVar } from "./DirectionBadge";
import { timeAgo, formatUsd } from "@/lib/alpha/format";

const HOUR_MS = 60 * 60 * 1000;

export default function WhalesSection() {
  const [whales, setWhales] = useState<WhaleMove[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const data = await alphaGet<WhaleMove[]>("/api/alpha/whales");
      if (!cancelled) setWhales(data ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* Split into recent (last 6h) and older (6-24h) for the past-results view. */
  const split = useMemo(() => {
    if (!whales) return { recent: [] as WhaleMove[], older: [] as WhaleMove[] };
    const now = Date.now();
    const recent: WhaleMove[] = [];
    const older: WhaleMove[] = [];
    for (const w of whales) {
      if (now - w.timestamp < 6 * HOUR_MS) recent.push(w);
      else older.push(w);
    }
    return { recent, older };
  }, [whales]);

  /* Aggregate stats across the visible feed. */
  const stats = useMemo(() => {
    if (!whales || whales.length === 0) {
      return { totalUsd: 0, bullish: 0, bearish: 0, neutral: 0, biggest: 0 };
    }
    let totalUsd = 0;
    let bullish = 0;
    let bearish = 0;
    let neutral = 0;
    let biggest = 0;
    for (const w of whales) {
      totalUsd += w.amountUsd;
      if (w.amountUsd > biggest) biggest = w.amountUsd;
      if (w.direction === "bullish") bullish++;
      else if (w.direction === "bearish") bearish++;
      else neutral++;
    }
    return { totalUsd, bullish, bearish, neutral, biggest };
  }, [whales]);

  return (
    <div className="space-y-5">
      {/* Header / aggregate stats */}
      <div
        className="card p-4 flex items-center justify-between flex-wrap gap-3"
        style={{ borderLeft: "3px solid var(--accent)" }}
      >
        <div>
          <div className="label-xs" style={{ color: "var(--accent-soft)" }}>
            Whale movements · $100K and above
          </div>
          <div
            className="text-[12px] mt-1"
            style={{ color: "var(--fg-muted)" }}
          >
            Aggregated on-chain flow across major exchange wallets · 6 chains tracked
          </div>
        </div>
        <span
          className="text-[10px] px-2 py-1 rounded-full font-mono"
          style={{
            background: "var(--accent-dim)",
            color: "var(--accent-soft)",
            letterSpacing: "0.05em",
          }}
        >
          {whales === null ? "LOADING…" : `${whales.length} TRACKED`}
        </span>
      </div>

      {/* Stats strip */}
      {whales && whales.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total flow" value={formatUsd(stats.totalUsd)} />
          <StatCard label="Largest move" value={formatUsd(stats.biggest)} />
          <StatCard
            label="Bullish reads"
            value={stats.bullish.toString()}
            colorVar="var(--success)"
          />
          <StatCard
            label="Bearish reads"
            value={stats.bearish.toString()}
            colorVar="var(--danger)"
          />
        </div>
      )}

      {/* Recent activity (last 6h) */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="label-sm" style={{ color: "var(--fg-muted)" }}>
            Recent activity · last 6 hours
          </div>
        </div>

        {whales === null && (
          <div className="text-sm" style={{ color: "var(--fg-dim)" }}>
            Aggregating whale flow…
          </div>
        )}

        {whales && split.recent.length === 0 && (
          <EmptyState
            title="No $100K+ moves in the last 6 hours"
            body="Quiet on-chain conditions right now. Either capital is parked, or movement is happening below our threshold. Check back in a few minutes — the feed refreshes every 90 seconds."
          />
        )}

        {whales && split.recent.length > 0 && (
          <div className="space-y-2">
            {split.recent.map((w) => (
              <WhaleRow key={w.id} move={w} />
            ))}
          </div>
        )}
      </div>

      {/* Past results (6-24h) */}
      {whales && split.older.length > 0 && (
        <div className="card p-5">
          <div className="label-sm mb-4" style={{ color: "var(--fg-muted)" }}>
            Past results · 6 to 24 hours ago
          </div>
          <div className="space-y-2">
            {split.older.map((w) => (
              <WhaleRow key={w.id} move={w} faded />
            ))}
          </div>
        </div>
      )}

      {/* Decentralization disclaimer */}
      <div
        className="card p-3"
        style={{
          background: "var(--bg-subtle)",
          borderColor: "var(--border)",
        }}
      >
        <p className="text-[11px]" style={{ color: "var(--fg-dim)" }}>
          Information aggregated from public on-chain data. Not financial
          advice. SbSe Guardian Alpha is a non-custodial intelligence layer —
          no execution, no custody, no KYC.
        </p>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  colorVar = "var(--fg)",
}: {
  label: string;
  value: string;
  colorVar?: string;
}) {
  return (
    <div className="card p-3">
      <div className="label-xs" style={{ color: "var(--fg-dim)" }}>
        {label}
      </div>
      <div
        className="font-mono mt-1"
        style={{ color: colorVar, fontSize: "18px" }}
      >
        {value}
      </div>
    </div>
  );
}

function WhaleRow({ move, faded = false }: { move: WhaleMove; faded?: boolean }) {
  const fill = directionFillVar(move.direction);
  const borderColor =
    move.direction === "bullish"
      ? "var(--success)"
      : move.direction === "bearish"
      ? "var(--danger)"
      : "var(--accent)";
  const sign =
    move.direction === "bearish" ? "−" : move.direction === "bullish" ? "+" : "";

  return (
    <div
      className="flex items-center justify-between p-3 rounded-lg gap-3"
      style={{
        background: "var(--bg-elevated)",
        borderLeft: `3px solid ${borderColor}`,
        opacity: faded ? 0.65 : 1,
      }}
    >
      <div className="flex-1 min-w-0">
        <div
          className="font-mono text-[12px] truncate"
          style={{ color: "var(--info)" }}
        >
          {move.address}
        </div>
        <div className="text-[12px] mt-0.5" style={{ color: "var(--fg-muted)" }}>
          {move.action} ·{" "}
          <span className="font-mono">{timeAgo(move.timestamp)}</span>
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <div className="font-mono font-medium" style={{ fontSize: "14px", color: fill }}>
          {sign}
          {formatUsd(move.amountUsd)}
        </div>
        <div className="text-[11px]" style={{ color: "var(--fg-dim)" }}>
          {move.asset}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="p-4 rounded-lg" style={{ background: "var(--bg-elevated)" }}>
      <div
        className="font-mono text-[11px] mb-2"
        style={{ color: "var(--fg-dim)", letterSpacing: "0.05em" }}
      >
        {title.toUpperCase()}
      </div>
      <p className="text-[13px]" style={{ color: "var(--fg-muted)" }}>
        {body}
      </p>
    </div>
  );
}
