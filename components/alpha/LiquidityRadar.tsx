"use client";

import { useEffect, useMemo, useState } from "react";
import { alphaGet } from "@/lib/alpha/client";
import type { RadarPoint } from "@/lib/alpha/liquidityRadar";

export default function LiquidityRadar() {
  const [points, setPoints] = useState<RadarPoint[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const data = await alphaGet<RadarPoint[]>("/api/alpha/liquidity-radar");
      if (!cancelled) setPoints(data ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* Compute geometry. */
  const geometry = useMemo(() => {
    if (!points || points.length === 0) return null;
    const sorted = [...points].sort((a, b) => b.depthUsd - a.depthUsd);
    const maxDepth = sorted[0].depthUsd || 1;
    const cx = 200;
    const cy = 200;
    const maxRadius = 150;
    const n = sorted.length;

    const axes = sorted.map((p, i) => {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
      return {
        ...p,
        angle,
        labelX: cx + (maxRadius + 30) * Math.cos(angle),
        labelY: cy + (maxRadius + 30) * Math.sin(angle),
        endX: cx + maxRadius * Math.cos(angle),
        endY: cy + maxRadius * Math.sin(angle),
      };
    });

    /* Filled polygon based on relative depth. */
    const polygon = axes
      .map((a) => {
        const r = (a.depthUsd / maxDepth) * maxRadius;
        const x = cx + r * Math.cos(a.angle);
        const y = cy + r * Math.sin(a.angle);
        return `${x},${y}`;
      })
      .join(" ");

    return { axes, polygon, cx, cy, maxRadius, maxDepth };
  }, [points]);

  if (points === null) {
    return (
      <div className="card p-5">
        <div className="text-sm" style={{ color: "var(--fg-dim)" }}>
          Mapping liquidity across top markets…
        </div>
      </div>
    );
  }

  if (!geometry || points.length === 0) {
    return (
      <div className="card p-5" style={{ borderLeft: "3px solid var(--warning)" }}>
        <div className="label-xs mb-2" style={{ color: "var(--warning)" }}>
          Liquidity Map · top markets
        </div>
        <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
          Order-book depth temporarily unavailable. The exchange endpoints
          we aggregate from are sometimes rate-limited from cloud regions.
          The map will refresh automatically within 2 minutes.
        </p>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
        <div>
          <div className="label-xs" style={{ color: "var(--accent-soft)" }}>
            Liquidity Map · top {geometry.axes.length} markets
          </div>
          <div className="text-[12px] mt-1" style={{ color: "var(--fg-muted)" }}>
            Combined bid + ask depth within ±2% of mid · refreshes every 2 minutes
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
          DEEPEST: {geometry.axes[0].symbol}
        </span>
      </div>

      <div className="flex gap-6 flex-wrap items-start">
        {/* SVG radar */}
        <svg
          width="400"
          height="400"
          viewBox="0 0 400 400"
          style={{ flex: "0 0 auto", maxWidth: "100%", height: "auto" }}
        >
          {/* Concentric grid rings */}
          {[0.25, 0.5, 0.75, 1.0].map((scale) => {
            const ringPoints = geometry.axes
              .map((a) => {
                const r = scale * geometry.maxRadius;
                const x = geometry.cx + r * Math.cos(a.angle);
                const y = geometry.cy + r * Math.sin(a.angle);
                return `${x},${y}`;
              })
              .join(" ");
            return (
              <polygon
                key={scale}
                points={ringPoints}
                fill="none"
                stroke="var(--border)"
                strokeWidth="1"
                opacity={scale === 1 ? 0.6 : 0.3}
              />
            );
          })}

          {/* Axis lines */}
          {geometry.axes.map((a) => (
            <line
              key={a.symbol}
              x1={geometry.cx}
              y1={geometry.cy}
              x2={a.endX}
              y2={a.endY}
              stroke="var(--border)"
              strokeWidth="1"
              opacity="0.5"
            />
          ))}

          {/* Filled depth polygon */}
          <polygon
            points={geometry.polygon}
            fill="var(--accent)"
            fillOpacity="0.25"
            stroke="var(--accent)"
            strokeWidth="2"
            style={{ filter: "drop-shadow(0 0 8px var(--accent))" }}
          />

          {/* Per-axis dots */}
          {geometry.axes.map((a) => {
            const r = (a.depthUsd / geometry.maxDepth) * geometry.maxRadius;
            const x = geometry.cx + r * Math.cos(a.angle);
            const y = geometry.cy + r * Math.sin(a.angle);
            const bidLeaning = a.bidShare > 52;
            const askLeaning = a.bidShare < 48;
            const dotColor = bidLeaning
              ? "var(--success)"
              : askLeaning
              ? "var(--danger)"
              : "var(--accent-soft)";
            return (
              <circle
                key={a.symbol}
                cx={x}
                cy={y}
                r="4"
                fill={dotColor}
                stroke="var(--bg-elevated)"
                strokeWidth="1.5"
              />
            );
          })}

          {/* Axis labels */}
          {geometry.axes.map((a) => (
            <text
              key={a.symbol}
              x={a.labelX}
              y={a.labelY}
              textAnchor="middle"
              dominantBaseline="middle"
              style={{
                fontSize: "11px",
                fontFamily: "var(--font-mono)",
                fill: "var(--fg)",
                letterSpacing: "0.05em",
              }}
            >
              {a.symbol}
            </text>
          ))}
        </svg>

        {/* Side panel with depth details */}
        <div className="flex-1 min-w-[220px]">
          <div className="label-xs mb-3" style={{ color: "var(--fg-dim)" }}>
            Depth ranking · ±2% from mid
          </div>
          <div className="space-y-2">
            {geometry.axes.map((a) => {
              const pct = (a.depthUsd / geometry.maxDepth) * 100;
              const fill =
                a.bidShare > 52
                  ? "var(--success)"
                  : a.bidShare < 48
                  ? "var(--danger)"
                  : "var(--accent-soft)";
              const lean =
                a.bidShare > 52
                  ? "bid-heavy"
                  : a.bidShare < 48
                  ? "ask-heavy"
                  : "balanced";
              return (
                <div key={a.symbol}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span
                      className="font-medium"
                      style={{ color: "var(--fg)", fontSize: "12px" }}
                    >
                      {a.symbol}
                    </span>
                    <span
                      className="font-mono"
                      style={{ color: "var(--fg-muted)", fontSize: "11px" }}
                    >
                      ${(a.depthUsd / 1_000_000).toFixed(1)}M
                    </span>
                  </div>
                  <div
                    className="h-[4px] rounded-full"
                    style={{ background: "var(--bg-subtle)" }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${pct}%`,
                        background: fill,
                      }}
                    />
                  </div>
                  <div
                    className="text-[10px] mt-0.5"
                    style={{ color: "var(--fg-dim)" }}
                  >
                    {lean} · {a.bidShare.toFixed(0)}% bid share
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div
        className="text-[11px] mt-4 pt-3 leading-relaxed"
        style={{
          color: "var(--fg-muted)",
          borderTop: "1px solid var(--border)",
        }}
      >
        Green dots indicate bid-heavy markets (potential accumulation pressure).
        Red dots indicate ask-heavy markets (potential distribution pressure).
        Larger radial reach = deeper liquidity, harder to move price.
      </div>
    </div>
  );
}
