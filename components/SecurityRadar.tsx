"use client";

import type { AuditReport } from "@/lib/types";

/**
 * Redesigned security radar.
 * - Indigo→accent gradient polygon fill with outer glow
 * - Glowing neon data points with subtle pulsing
 * - Animated polygon draw-in on mount
 * - Clean rings using CSS variable borders
 * - Layer breakdown below with per-layer progress bars
 */
export default function SecurityRadar({ report }: { report: AuditReport }) {
  const layers = report.layerScores;
  const size = 280;
  const center = size / 2;
  const maxRadius = size / 2 - 44;
  const levels = 5;

  const angle = (i: number) => (Math.PI * 2 * i) / layers.length - Math.PI / 2;

  const pointFor = (i: number, score: number) => {
    const r = (score / 10) * maxRadius;
    return {
      x: center + r * Math.cos(angle(i)),
      y: center + r * Math.sin(angle(i)),
    };
  };

  const axisEnd = (i: number) => ({
    x: center + maxRadius * Math.cos(angle(i)),
    y: center + maxRadius * Math.sin(angle(i)),
  });

  const polygonPoints = layers
    .map((l, i) => {
      const p = pointFor(i, l.score);
      return `${p.x},${p.y}`;
    })
    .join(" ");

  // Compute average score for the big number
  const avgScore = layers.length
    ? layers.reduce((a, b) => a + b.score, 0) / layers.length
    : 0;

  return (
    <section
      className="card card-hover relative overflow-hidden anim-fade-up"
      style={{ padding: "28px 32px" }}
      aria-labelledby="radar-title"
    >
      {/* Ambient glow */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 50% 40%, rgba(108,99,255,0.12), transparent 55%)",
        }}
      />

      {/* Header */}
      <div className="relative flex items-baseline justify-between gap-4 mb-7">
        <h3
          id="radar-title"
          className="text-xl font-semibold tracking-tight"
          style={{ color: "var(--fg)", letterSpacing: "-0.02em" }}
        >
          Security Layers
        </h3>
        <span className="label-xs">Score 0–10</span>
      </div>

      <div className="relative flex flex-col items-center gap-7">
        <div className="relative">
          {/* Average-score pill in top-right corner */}
          <div
            className="absolute z-10 font-mono text-xs tracking-[0.1em] rounded-full px-2.5 py-1"
            style={{
              top: "8px",
              right: "0",
              background: "var(--accent-dim)",
              border: "1px solid var(--border-accent)",
              color: "var(--accent-soft)",
            }}
          >
            avg {avgScore.toFixed(1)}
          </div>

          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            role="img"
            aria-label={`Security layers: ${layers
              .map((l) => `${l.label} ${l.score}/10`)
              .join(", ")}`}
            style={{ overflow: "visible" }}
          >
            <defs>
              {/* Gradient fill for polygon */}
              <radialGradient id="radarFill" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgba(108,99,255,0.35)" />
                <stop offset="100%" stopColor="rgba(108,99,255,0.05)" />
              </radialGradient>
              {/* Stroke gradient */}
              <linearGradient id="radarStroke" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#6c63ff" />
                <stop offset="100%" stopColor="#8b84ff" />
              </linearGradient>
              {/* Point glow filter */}
              <filter id="pointGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Concentric level rings */}
            {Array.from({ length: levels }).map((_, lvl) => {
              const r = ((lvl + 1) / levels) * maxRadius;
              const pts = layers
                .map((_, i) => {
                  const x = center + r * Math.cos(angle(i));
                  const y = center + r * Math.sin(angle(i));
                  return `${x},${y}`;
                })
                .join(" ");
              return (
                <polygon
                  key={lvl}
                  points={pts}
                  fill="none"
                  stroke="rgba(255,255,255,0.05)"
                  strokeWidth={1}
                />
              );
            })}

            {/* Axis lines */}
            {layers.map((_, i) => {
              const end = axisEnd(i);
              return (
                <line
                  key={i}
                  x1={center}
                  y1={center}
                  x2={end.x}
                  y2={end.y}
                  stroke="rgba(255,255,255,0.05)"
                  strokeWidth={1}
                />
              );
            })}

            {/* Data polygon */}
            <polygon
              points={polygonPoints}
              fill="url(#radarFill)"
              stroke="url(#radarStroke)"
              strokeWidth={2}
              style={{
                animation: "radarDrawIn 0.8s var(--ease) 0.1s both",
                filter: "drop-shadow(0 0 12px rgba(108,99,255,0.3))",
              }}
            />

            {/* Data points with glow */}
            {layers.map((layer, i) => {
              const p = pointFor(i, layer.score);
              return (
                <g
                  key={layer.id}
                  style={{
                    animation: `radarPointIn 0.5s var(--ease) ${0.3 + i * 0.08}s both`,
                  }}
                >
                  {/* Outer glow pulse */}
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={6}
                    fill="#6c63ff"
                    opacity={0.4}
                    filter="url(#pointGlow)"
                    style={{
                      animation: `radarPulse 2.4s ease-in-out ${i * 0.2}s infinite`,
                    }}
                  />
                  {/* Core dot */}
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={4}
                    fill="#fff"
                    stroke="#6c63ff"
                    strokeWidth={2}
                  />
                  <title>{`${layer.label}: ${layer.score}/10 — ${layer.summary}`}</title>
                </g>
              );
            })}

            {/* Axis labels */}
            {layers.map((layer, i) => {
              const a = angle(i);
              const labelR = maxRadius + 22;
              const x = center + labelR * Math.cos(a);
              const y = center + labelR * Math.sin(a);
              const anchor =
                Math.abs(Math.cos(a)) < 0.2
                  ? "middle"
                  : Math.cos(a) > 0
                  ? "start"
                  : "end";
              return (
                <text
                  key={`lbl-${layer.id}`}
                  x={x}
                  y={y}
                  textAnchor={anchor}
                  dominantBaseline="middle"
                  fill="var(--fg-muted)"
                  fontSize="10"
                  fontFamily="var(--font-mono)"
                  letterSpacing="0.1em"
                  style={{ textTransform: "uppercase" }}
                >
                  {abbrev(layer.label)}
                </text>
              );
            })}
          </svg>
        </div>

        {/* Layer breakdown list */}
        <ul className="w-full space-y-0" role="list">
          {layers.map((layer) => {
            const tone = scoreTone(layer.score);
            const pct = (layer.score / 10) * 100;
            return (
              <li
                key={layer.id}
                className="relative py-3 border-b last:border-0"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="flex items-center gap-3 mb-1.5">
                  <span
                    className="text-sm flex-1 truncate"
                    style={{ color: "var(--fg)" }}
                  >
                    {layer.label}
                  </span>
                  <span
                    className="font-mono text-sm tabular-nums shrink-0"
                    style={{ color: tone.color }}
                  >
                    {layer.score}
                    <span style={{ color: "var(--fg-dim)" }}>/10</span>
                  </span>
                </div>

                {/* Mini score bar */}
                <div
                  className="relative h-1 rounded-full overflow-hidden mb-1"
                  style={{ background: "var(--border)" }}
                >
                  <div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{
                      width: `${pct}%`,
                      background: tone.color,
                      boxShadow: `0 0 6px ${tone.glow}`,
                      transition: "width 1s var(--ease) 0.4s",
                    }}
                  />
                </div>

                <p className="text-xs" style={{ color: "var(--fg-dim)" }}>
                  {layer.summary}
                </p>
              </li>
            );
          })}
        </ul>
      </div>

      <style jsx>{`
        @keyframes radarDrawIn {
          from {
            opacity: 0;
            transform: scale(0.6);
            transform-origin: center;
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        @keyframes radarPointIn {
          from { opacity: 0; transform: scale(0); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes radarPulse {
          0%, 100% { opacity: 0.35; transform: scale(1); }
          50% { opacity: 0.65; transform: scale(1.15); }
        }
      `}</style>
    </section>
  );
}

function scoreTone(score: number): { color: string; glow: string } {
  if (score >= 8) return { color: "var(--success)", glow: "rgba(74,222,128,0.5)" };
  if (score >= 5) return { color: "var(--warning)", glow: "rgba(250,204,21,0.5)" };
  return { color: "var(--danger)", glow: "rgba(248,113,113,0.5)" };
}

function abbrev(label: string): string {
  // Shorten labels to fit around the radar ring
  const short: Record<string, string> = {
    "DEX Analysis": "DEX",
    "Liquidity Lock": "LIQ",
    "Liquidity": "LIQ",
    "Holder Distribution": "HOLDERS",
    "Holders": "HOLDERS",
    "Proxy Detection": "PROXY",
    "Honeypot Detection": "HONEYPOT",
  };
  return short[label] ?? label.toUpperCase().slice(0, 8);
}
