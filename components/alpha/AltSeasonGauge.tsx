"use client";

import { useEffect, useState } from "react";
import { alphaGet } from "@/lib/alpha/client";
import type { AltSeasonData } from "@/lib/alpha/altSeasonIndex";

export default function AltSeasonGauge() {
  const [data, setData] = useState<AltSeasonData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await alphaGet<AltSeasonData>("/api/alpha/altseason");
      if (!cancelled) {
        setData(result);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="card p-5">
        <div className="text-sm" style={{ color: "var(--fg-dim)" }}>
          Computing Alt Season Index…
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div
        className="card p-5"
        style={{ borderLeft: "3px solid var(--warning)" }}
      >
        <div className="label-xs mb-2" style={{ color: "var(--warning)" }}>
          Alt Season Index temporarily computing
        </div>
        <p className="text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
          The top-50 market feed is rate-limited right now. The fallback path
          is active and the index will populate within a couple of minutes.
        </p>
      </div>
    );
  }

  const accent =
    data.label === "Alt Season"
      ? "var(--accent-soft)"
      : data.label === "Alt Bias"
      ? "var(--accent)"
      : data.label === "Mixed"
      ? "var(--warning)"
      : data.label === "Bitcoin Bias"
      ? "#f59e0b"
      : "#fb923c";

  /* SVG gauge: half-circle from -90° (left, 0) to 90° (right, 100). */
  const size = 220;
  const cx = size / 2;
  const cy = size * 0.7;
  const radius = 80;
  const trackThickness = 14;

  function arcPath(startPct: number, endPct: number): string {
    const startAngle = Math.PI - (startPct / 100) * Math.PI;
    const endAngle = Math.PI - (endPct / 100) * Math.PI;
    const x1 = cx + radius * Math.cos(startAngle);
    const y1 = cy - radius * Math.sin(startAngle);
    const x2 = cx + radius * Math.cos(endAngle);
    const y2 = cy - radius * Math.sin(endAngle);
    const largeArc = endPct - startPct > 50 ? 1 : 0;
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`;
  }

  /* Needle position. */
  const needleAngle = Math.PI - (data.index / 100) * Math.PI;
  const needleLen = radius - trackThickness;
  const needleX = cx + needleLen * Math.cos(needleAngle);
  const needleY = cy - needleLen * Math.sin(needleAngle);

  return (
    <div className="card p-5" style={{ borderLeft: `3px solid ${accent}` }}>
      <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
        <div>
          <div className="label-xs mb-1" style={{ color: accent }}>
            Alt Season Index
          </div>
          <div className="text-[12px]" style={{ color: "var(--fg-muted)" }}>
            {data.altcoinsOutperforming} of {data.totalAltcoins} top altcoins
            outperforming BTC over 7 days
          </div>
        </div>
        <span
          className="text-[10px] px-2 py-1 rounded-full font-mono"
          style={{
            background: "var(--bg-subtle)",
            color: accent,
            letterSpacing: "0.05em",
            border: `1px solid ${accent}40`,
          }}
        >
          {data.label.toUpperCase()}
        </span>
      </div>

      <div className="flex items-center gap-6 flex-wrap">
        {/* Gauge */}
        <div style={{ flex: "0 0 auto" }}>
          <svg
            width={size}
            height={size * 0.75}
            viewBox={`0 0 ${size} ${size * 0.75}`}
          >
            {/* Background zones — color gradient from BTC season (orange)
                to alt season (purple) */}
            <path
              d={arcPath(0, 25)}
              fill="none"
              stroke="#fb923c"
              strokeWidth={trackThickness}
              strokeLinecap="butt"
              opacity="0.35"
            />
            <path
              d={arcPath(25, 40)}
              fill="none"
              stroke="#f59e0b"
              strokeWidth={trackThickness}
              strokeLinecap="butt"
              opacity="0.35"
            />
            <path
              d={arcPath(40, 60)}
              fill="none"
              stroke="var(--warning)"
              strokeWidth={trackThickness}
              strokeLinecap="butt"
              opacity="0.35"
            />
            <path
              d={arcPath(60, 75)}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={trackThickness}
              strokeLinecap="butt"
              opacity="0.4"
            />
            <path
              d={arcPath(75, 100)}
              fill="none"
              stroke="var(--accent-soft)"
              strokeWidth={trackThickness}
              strokeLinecap="butt"
              opacity="0.55"
            />

            {/* Active arc up to current index */}
            <path
              d={arcPath(0, data.index)}
              fill="none"
              stroke={accent}
              strokeWidth={trackThickness - 4}
              strokeLinecap="round"
              style={{
                filter: `drop-shadow(0 0 6px ${accent})`,
              }}
            />

            {/* Needle */}
            <line
              x1={cx}
              y1={cy}
              x2={needleX}
              y2={needleY}
              stroke={accent}
              strokeWidth="2"
              strokeLinecap="round"
            />
            <circle cx={cx} cy={cy} r="4" fill={accent} />

            {/* Tick labels */}
            <text
              x={cx - radius - 4}
              y={cy + 16}
              textAnchor="middle"
              style={{
                fontSize: "9px",
                fontFamily: "var(--font-mono)",
                fill: "var(--fg-dim)",
                letterSpacing: "0.05em",
              }}
            >
              0 BTC
            </text>
            <text
              x={cx}
              y={cy - radius - 8}
              textAnchor="middle"
              style={{
                fontSize: "9px",
                fontFamily: "var(--font-mono)",
                fill: "var(--fg-dim)",
                letterSpacing: "0.05em",
              }}
            >
              50
            </text>
            <text
              x={cx + radius + 4}
              y={cy + 16}
              textAnchor="middle"
              style={{
                fontSize: "9px",
                fontFamily: "var(--font-mono)",
                fill: "var(--fg-dim)",
                letterSpacing: "0.05em",
              }}
            >
              ALT 100
            </text>
          </svg>
          <div className="text-center" style={{ marginTop: "-26px" }}>
            <div
              className="font-mono font-medium"
              style={{
                fontSize: "32px",
                color: accent,
                letterSpacing: "-0.02em",
              }}
            >
              {data.index}
            </div>
            <div
              className="font-mono"
              style={{
                fontSize: "9px",
                color: "var(--fg-dim)",
                letterSpacing: "0.1em",
              }}
            >
              INDEX · 0–100
            </div>
          </div>
        </div>

        {/* Top performers */}
        <div className="flex-1 min-w-[220px]">
          <div className="label-xs mb-2" style={{ color: "var(--fg-dim)" }}>
            Top altcoin outperformers vs BTC · 7d
          </div>
          {data.topPerformers.length === 0 ? (
            <p className="text-[12px]" style={{ color: "var(--fg-dim)" }}>
              No altcoins beating BTC right now — capital is rotating into BTC.
            </p>
          ) : (
            <div className="space-y-2">
              {data.topPerformers.map((p) => (
                <div
                  key={p.symbol}
                  className="flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {p.imageUrl && (
                      <img
                        src={p.imageUrl}
                        alt=""
                        width={16}
                        height={16}
                        style={{ borderRadius: "50%" }}
                      />
                    )}
                    <span
                      className="font-medium truncate"
                      style={{ color: "var(--fg)", fontSize: "12px" }}
                    >
                      {p.symbol}
                    </span>
                    <span
                      className="truncate"
                      style={{ color: "var(--fg-dim)", fontSize: "10px" }}
                    >
                      {p.name}
                    </span>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span
                      className="font-mono"
                      style={{ color: "var(--success)", fontSize: "11px" }}
                    >
                      +{p.outperformanceVsBtcPct.toFixed(1)}%
                    </span>
                    <div
                      className="font-mono text-[9px]"
                      style={{ color: "var(--fg-dim)" }}
                    >
                      vs BTC
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div
        className="text-[11px] mt-4 leading-relaxed"
        style={{ color: "var(--fg-muted)" }}
      >
        BTC is{" "}
        <span
          className="font-mono"
          style={{
            color: data.btcChange7dPct >= 0 ? "var(--success)" : "var(--danger)",
          }}
        >
          {data.btcChange7dPct >= 0 ? "+" : ""}
          {data.btcChange7dPct.toFixed(2)}%
        </span>{" "}
        over the last 7 days. {indexExplanation(data.label)}
      </div>
    </div>
  );
}

function indexExplanation(label: string): string {
  switch (label) {
    case "Alt Season":
      return "Capital is rotating aggressively into altcoins — historically a sign of late-cycle euphoria.";
    case "Alt Bias":
      return "Altcoins are outperforming, suggesting capital rotation is underway. Watch for sustained breadth.";
    case "Mixed":
      return "No clear directional rotation between BTC and altcoins right now.";
    case "Bitcoin Bias":
      return "BTC is outperforming most altcoins — typically a defensive or early-cycle pattern.";
    case "Bitcoin Season":
      return "Strong BTC dominance — capital is concentrated in BTC, alt rotation has stalled.";
    default:
      return "";
  }
}
