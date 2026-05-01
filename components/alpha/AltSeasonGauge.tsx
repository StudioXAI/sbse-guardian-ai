"use client";

import { useCallback, useEffect } from "react";
import { alphaGet } from "@/lib/alpha/client";
import { useAutoRefresh } from "@/lib/alpha/useAutoRefresh";
import { useRefreshContext } from "@/lib/alpha/refreshContext";
import type { AltSeasonData } from "@/lib/alpha/altSeasonIndex";

const REFRESH_MS = 90_000;

export default function AltSeasonGauge() {
  const { reportRefresh } = useRefreshContext();

  const loader = useCallback(async () => {
    return alphaGet<AltSeasonData>("/api/alpha/altseason");
  }, []);

  const { data, loading, lastRefreshedAt } = useAutoRefresh<AltSeasonData>(
    loader,
    REFRESH_MS,
  );

  useEffect(() => {
    if (lastRefreshedAt !== null) reportRefresh();
  }, [lastRefreshedAt, reportRefresh]);

  /* Hide entirely while loading — the rest of the predictions tab has
     content that loads in parallel so there's no empty UI. */
  if (loading) return null;

  /* If data is unavailable, render nothing — the rest of the predictions
     tab has the AI summary and prediction cards which always work, so
     this gauge silently hides instead of showing a scary error. */
  if (!data) return null;

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
    /* Clamp inputs into valid range to prevent NaN paths if data drifts. */
    const sp = Math.max(0, Math.min(100, startPct));
    const ep = Math.max(0, Math.min(100, endPct));
    const startAngle = Math.PI - (sp / 100) * Math.PI;
    const endAngle = Math.PI - (ep / 100) * Math.PI;
    const x1 = cx + radius * Math.cos(startAngle);
    const y1 = cy - radius * Math.sin(startAngle);
    const x2 = cx + radius * Math.cos(endAngle);
    const y2 = cy - radius * Math.sin(endAngle);
    /* The gauge spans only 180° (a half-circle), so the angular sweep
       between any two points on the arc is at most 180°. SVG's
       largeArc flag should be 1 only when the sweep EXCEEDS 180° —
       which is impossible on a half-circle. Always 0. The previous
       implementation set it to 1 when the percentage span exceeded
       50%, which made the renderer draw the LONG way around (through
       the bottom of the circle), producing the glitchy "flip" you'd
       see whenever the index crossed 50. */
    return `M ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2}`;
  }

  /* Needle position. The needle is drawn pointing left from the
     center pivot (rest position) and rotated clockwise via CSS
     transform based on index. At index=0 → 0° rotation (points
     left). At index=50 → 90° (points up). At index=100 → 180°
     (points right). This rotation is what's actually animated; the
     line geometry itself stays constant which is why the transition
     works reliably. */
  const needleLen = radius - trackThickness;
  const idx = Math.max(0, Math.min(100, data.index));
  const needleRotationDeg = (idx / 100) * 180;

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

            {/* Active arc up to current index. Skip render entirely when
                index is 0 — a zero-length arc with strokeLinecap="round"
                produces a small dot that flickers when data refreshes.
                The arc itself snaps on data refresh (SVG path `d`
                animation is unreliable across browsers) but the snap
                is brief enough not to be jarring once we removed the
                largeArc bug that made it flip. */}
            {data.index > 0 && (
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
            )}

            {/* Needle. Drawn as a horizontal line at y=cy (pointing
                left) and rotated into position via CSS transform.
                This makes the rotation smoothly animatable across all
                browsers — SVG `transform` on a `line` is well-supported
                for animated transitions, while animating x2/y2 is not. */}
            <g
              style={{
                transform: `rotate(${needleRotationDeg}deg)`,
                transformOrigin: `${cx}px ${cy}px`,
                transition: "transform 600ms cubic-bezier(0.4, 0, 0.2, 1)",
              }}
            >
              <line
                x1={cx}
                y1={cy}
                x2={cx - needleLen}
                y2={cy}
                stroke={accent}
                strokeWidth="2"
                strokeLinecap="round"
              />
            </g>
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
