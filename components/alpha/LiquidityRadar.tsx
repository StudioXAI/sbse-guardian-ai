"use client";

import { useEffect, useState } from "react";
import { alphaGet } from "@/lib/alpha/client";
import type {
  RadarPoint,
  LiquidityHeatmapData,
} from "@/lib/alpha/liquidityRadar";

export default function LiquidityRadar() {
  const [data, setData] = useState<LiquidityHeatmapData | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await alphaGet<LiquidityHeatmapData>(
        "/api/alpha/liquidity-radar",
      );
      if (!cancelled) {
        setData(
          result ?? { points: [], insights: [], generatedAt: Date.now() },
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (data === null) {
    return (
      <div className="card p-5">
        <div className="text-sm" style={{ color: "var(--fg-dim)" }}>
          Mapping liquidity across top markets…
        </div>
      </div>
    );
  }

  if (data.points.length === 0) {
    return (
      <div className="card p-5" style={{ borderLeft: "3px solid var(--warning)" }}>
        <div className="label-xs mb-2" style={{ color: "var(--warning)" }}>
          Liquidity heatmap unavailable
        </div>
        <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
          Order-book depth temporarily unreachable. The map refreshes every
          2 minutes — check back shortly.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* AI overview / insights card */}
      <div
        className="card p-4"
        style={{ borderLeft: "3px solid var(--accent)" }}
      >
        <div
          className="label-xs mb-1"
          style={{ color: "var(--accent-soft)" }}
        >
          Liquidity overview · AI analysis
        </div>
        <div className="text-[11px] mb-3" style={{ color: "var(--fg-dim)" }}>
          What the order books are telling you across the top 10 markets right now
        </div>
        <ul className="space-y-2">
          {data.insights.map((insight, i) => (
            <li key={i} className="flex items-start gap-2">
              <span
                style={{
                  color: "var(--accent-soft)",
                  fontSize: "12px",
                  lineHeight: "1.5",
                }}
              >
                ▸
              </span>
              <span
                className="text-[13px] leading-relaxed"
                style={{ color: "var(--fg)" }}
              >
                {insight}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Per-currency heatmap cards */}
      <div className="grid gap-3 md:grid-cols-2">
        {data.points.map((p) => (
          <HeatmapCard key={p.symbol} point={p} />
        ))}
      </div>

      <div
        className="card p-3"
        style={{
          background: "var(--bg-subtle)",
          borderColor: "var(--border)",
        }}
      >
        <p className="text-[11px] leading-relaxed" style={{ color: "var(--fg-dim)" }}>
          Reading the heatmap: green cells show resting buy-side liquidity (long support),
          red cells show resting sell-side liquidity (short resistance). Cell intensity
          reflects USD volume at that price band. The marked walls are where the deepest
          orders sit — these are levels price is most likely to react to.
        </p>
      </div>
    </div>
  );
}

function fmtPrice(v: number): string {
  if (v >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (v >= 1) return v.toFixed(2);
  return v.toFixed(4);
}

function HeatmapCard({ point: p }: { point: RadarPoint }) {
  const localMax = Math.max(...p.depthBuckets);
  const lean =
    p.bidShare > 53 ? "bid-tilted" : p.bidShare < 47 ? "ask-tilted" : "balanced";
  const leanColor =
    p.bidShare > 53
      ? "var(--success)"
      : p.bidShare < 47
      ? "var(--danger)"
      : "var(--fg)";

  return (
    <div className="card p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-baseline gap-2">
          <span
            className="font-medium"
            style={{ color: "var(--fg)", fontSize: "15px" }}
          >
            {p.symbol}
          </span>
          <span
            className="font-mono"
            style={{ color: "var(--fg-dim)", fontSize: "11px" }}
          >
            spot ${fmtPrice(p.midUsd)}
          </span>
        </div>
        <span
          className="font-mono text-[10px] px-2 py-0.5 rounded-full"
          style={{
            background: "var(--bg-subtle)",
            color: "var(--accent-soft)",
            letterSpacing: "0.05em",
          }}
        >
          ${(p.depthUsd / 1e6).toFixed(1)}M ±2%
        </span>
      </div>

      {/* Wall info */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div
          className="p-2 rounded"
          style={{
            background: "var(--success-dim)",
            border: "1px solid rgba(34, 197, 94, 0.3)",
          }}
        >
          <div
            className="font-mono"
            style={{
              color: "var(--success)",
              fontSize: "9px",
              letterSpacing: "0.06em",
            }}
          >
            DEEPEST LONG ORDERS
          </div>
          <div
            className="font-mono mt-0.5"
            style={{ color: "var(--fg)", fontSize: "14px" }}
          >
            ${fmtPrice(p.bidWallPrice)}
          </div>
          <div className="text-[10px] mt-0.5" style={{ color: "var(--fg-muted)" }}>
            <span style={{ color: "var(--success)" }}>
              {p.bidWallPctFromSpot.toFixed(2)}%
            </span>
            {" · "}${(p.bidWallUsd / 1e6).toFixed(2)}M
          </div>
        </div>

        <div
          className="p-2 rounded"
          style={{
            background: "var(--danger-dim)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
          }}
        >
          <div
            className="font-mono"
            style={{
              color: "var(--danger)",
              fontSize: "9px",
              letterSpacing: "0.06em",
            }}
          >
            DEEPEST SHORT ORDERS
          </div>
          <div
            className="font-mono mt-0.5"
            style={{ color: "var(--fg)", fontSize: "14px" }}
          >
            ${fmtPrice(p.askWallPrice)}
          </div>
          <div className="text-[10px] mt-0.5" style={{ color: "var(--fg-muted)" }}>
            <span style={{ color: "var(--danger)" }}>
              +{p.askWallPctFromSpot.toFixed(2)}%
            </span>
            {" · "}${(p.askWallUsd / 1e6).toFixed(2)}M
          </div>
        </div>
      </div>

      {/* Heat strip — 21 cells, ±5% range, 0.5% per cell */}
      <div className="relative">
        <div
          className="flex h-9 rounded overflow-hidden"
          style={{
            background: "var(--bg-subtle)",
            border: "1px solid var(--border)",
          }}
        >
          {p.depthBuckets.map((value, i) => {
            const isMid = i === 10;
            const isBid = i < 10;
            const isAsk = i > 10;
            const isBidWall = i === p.bidWallIndex && p.bidWallUsd > 0;
            const isAskWall = i === p.askWallIndex && p.askWallUsd > 0;
            const intensity =
              localMax > 0 ? Math.min(1, value / localMax) : 0;

            let bg = "transparent";
            if (isMid) bg = "var(--border-strong)";
            else if (isBid)
              bg = `rgba(34, 197, 94, ${0.05 + intensity * 0.85})`;
            else if (isAsk)
              bg = `rgba(239, 68, 68, ${0.05 + intensity * 0.85})`;

            return (
              <div
                key={i}
                title={`${i < 10 ? "−" : i > 10 ? "+" : ""}${Math.abs(
                  (i - 10) * 0.5,
                ).toFixed(1)}% · $${(value / 1000).toFixed(0)}K`}
                style={{
                  flex: 1,
                  background: bg,
                  position: "relative",
                  boxShadow:
                    isBidWall || isAskWall
                      ? "inset 0 0 0 2px var(--accent-soft)"
                      : "none",
                  transition: "background 0.2s",
                }}
              />
            );
          })}
        </div>

        {/* Wall position markers */}
        <div className="relative" style={{ height: "12px", marginTop: "2px" }}>
          {p.bidWallUsd > 0 && (
            <div
              style={{
                position: "absolute",
                left: `${((p.bidWallIndex + 0.5) / 21) * 100}%`,
                transform: "translateX(-50%)",
                fontSize: "8px",
                fontFamily: "var(--font-mono)",
                color: "var(--success)",
                letterSpacing: "0.05em",
              }}
            >
              ▲ LONG
            </div>
          )}
          {p.askWallUsd > 0 && (
            <div
              style={{
                position: "absolute",
                left: `${((p.askWallIndex + 0.5) / 21) * 100}%`,
                transform: "translateX(-50%)",
                fontSize: "8px",
                fontFamily: "var(--font-mono)",
                color: "var(--danger)",
                letterSpacing: "0.05em",
              }}
            >
              ▲ SHORT
            </div>
          )}
        </div>

        {/* Price scale */}
        <div
          className="flex justify-between mt-1"
          style={{
            fontSize: "9px",
            fontFamily: "var(--font-mono)",
            color: "var(--fg-dim)",
          }}
        >
          <span>−5%</span>
          <span>−2.5%</span>
          <span style={{ color: "var(--accent-soft)" }}>SPOT</span>
          <span>+2.5%</span>
          <span>+5%</span>
        </div>
      </div>

      {/* Footer */}
      <div
        className="flex items-center justify-between mt-3"
        style={{ fontSize: "10px", color: "var(--fg-muted)" }}
      >
        <span>
          Bid share:{" "}
          <span style={{ color: leanColor }}>{p.bidShare.toFixed(0)}%</span>
        </span>
        <span style={{ color: leanColor, fontStyle: "italic" }}>{lean}</span>
      </div>
    </div>
  );
}
