"use client";

import type { AuditReport } from "@/lib/types";

/**
 * Hand-rolled SVG radar chart.
 * Chose a radar over progress bars because it gives an instant gestalt
 * read — one glance and you see the security "shape" of the token.
 */
export default function SecurityRadar({ report }: { report: AuditReport }) {
  const size = 320;
  const center = size / 2;
  const maxRadius = size / 2 - 48;
  const layers = report.layerScores;
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

  return (
    <section
      className="rounded-[28px] border p-8 anim-fade-up"
      style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}
      aria-labelledby="radar-title"
    >
      <div className="flex items-baseline justify-between mb-6">
        <h3 id="radar-title" className="font-display italic text-2xl">
          Security layers
        </h3>
        <span className="font-mono text-xs tracking-[0.2em] uppercase"
              style={{ color: "var(--fg-dim)" }}>
          Score 0–10
        </span>
      </div>

      <div className="flex flex-col items-center gap-6">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={`Security layers: ${layers
            .map((l) => `${l.label} ${l.score}/10`)
            .join(", ")}`}
        >
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
                stroke="rgba(255,249,240,0.06)"
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
                stroke="rgba(255,249,240,0.06)"
                strokeWidth={1}
              />
            );
          })}

          {/* Data polygon with amber fill */}
          <polygon
            points={polygonPoints}
            fill="rgba(245,166,35,0.15)"
            stroke="#f5a623"
            strokeWidth={1.5}
            style={{ animation: "fadeIn 0.8s ease-out 0.2s both" }}
          />

          {/* Data points */}
          {layers.map((layer, i) => {
            const p = pointFor(i, layer.score);
            return (
              <g key={layer.id} style={{ animation: `fadeIn 0.6s ease-out ${0.4 + i * 0.08}s both` }}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={4}
                  fill="#f5a623"
                  stroke="var(--bg)"
                  strokeWidth={2}
                />
                <title>{`${layer.label}: ${layer.score}/10 — ${layer.summary}`}</title>
              </g>
            );
          })}

          {/* Axis labels */}
          {layers.map((layer, i) => {
            const a = angle(i);
            const labelR = maxRadius + 26;
            const x = center + labelR * Math.cos(a);
            const y = center + labelR * Math.sin(a);
            /* Anchor by position so labels don't overlap the chart */
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
                fontSize="11"
                fontFamily="var(--font-mono)"
                letterSpacing="0.08em"
              >
                {layer.label.toUpperCase()}
              </text>
            );
          })}
        </svg>

        {/* Score breakdown below the radar */}
        <ul className="w-full grid gap-2" role="list">
          {layers.map((layer) => (
            <li
              key={layer.id}
              className="flex items-center justify-between gap-4 py-2 border-b last:border-0"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm" style={{ color: "var(--fg)" }}>
                  {layer.label}
                </div>
                <div className="text-xs truncate" style={{ color: "var(--fg-dim)" }}>
                  {layer.summary}
                </div>
              </div>
              <div className="font-mono text-sm" style={{ color: "var(--amber)" }}>
                {layer.score}
                <span style={{ color: "var(--fg-dim)" }}>/10</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
