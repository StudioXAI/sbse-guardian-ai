"use client";

import type { AuditReport, Finding } from "@/lib/types";

/**
 * Redesigned risk composition donut.
 * - Segments animate in with stroke-dashoffset transition (draw-on effect)
 * - Center "total" is gradient-stroked for depth
 * - Legend has mini progress fills for each severity tier
 * - Full new color palette (indigo accent, neon success, amber warning)
 */
export default function RiskDonut({ report }: { report: AuditReport }) {
  const bad = report.findings.filter((f) => f.severity === "bad").length;
  const warn = report.findings.filter((f) => f.severity === "warn").length;
  const good = report.findings.filter((f) => f.severity === "good").length;
  const info = report.findings.filter((f) => f.severity === "info").length;
  const total = bad + warn + good + info || 1;

  type Segment = {
    id: Finding["severity"];
    label: string;
    value: number;
    color: string;
    glow: string;
  };

  const allSegments: Segment[] = [
    {
      id: "bad",
      label: "Critical",
      value: bad,
      color: "#f87171",
      glow: "rgba(248,113,113,0.45)",
    },
    {
      id: "warn",
      label: "Warnings",
      value: warn,
      color: "#facc15",
      glow: "rgba(250,204,21,0.35)",
    },
    {
      id: "info",
      label: "Info",
      value: info,
      color: "#60a5fa",
      glow: "rgba(96,165,250,0.35)",
    },
    {
      id: "good",
      label: "Clean",
      value: good,
      color: "#4ade80",
      glow: "rgba(74,222,128,0.35)",
    },
  ];

  const segments = allSegments.filter((s) => s.value > 0);

  const size = 260;
  const strokeWidth = 26;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const cx = size / 2;
  const cy = size / 2;

  let accumulated = 0;
  const arcs = segments.map((seg, i) => {
    const pct = seg.value / total;
    const length = circumference * pct;
    const gap = circumference - length;
    const rotation = (accumulated / total) * 360 - 90;
    accumulated += seg.value;
    return {
      ...seg,
      length,
      gap,
      rotation,
      delay: i * 0.15,
    };
  });

  // Dominant finding type for headline tone
  const dominant = segments.reduce((max, s) => (s.value > max.value ? s : max), segments[0] || allSegments[3]);

  return (
    <section
      className="card card-hover relative overflow-hidden anim-fade-up"
      style={{ padding: "28px 32px" }}
      aria-labelledby="donut-title"
    >
      {/* Ambient radial glow */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(circle at 50% 45%, ${dominant?.glow ?? "rgba(108,99,255,0.1)"}, transparent 55%)`,
          opacity: 0.6,
        }}
      />

      {/* Header */}
      <div className="relative flex items-baseline justify-between gap-4 mb-7">
        <h3 id="donut-title" className="text-xl font-semibold tracking-tight" style={{ color: "var(--fg)", letterSpacing: "-0.02em" }}>
          Risk Composition
        </h3>
        <span className="label-xs">{total} findings</span>
      </div>

      <div className="relative flex flex-col items-center gap-8">
        {/* Donut */}
        <div
          className="relative"
          role="img"
          aria-label={`Risk composition: ${segments.map((s) => `${s.label} ${s.value}`).join(", ")}`}
        >
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            style={{ overflow: "visible" }}
          >
            {/* Track ring */}
            <circle
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke="var(--border)"
              strokeWidth={strokeWidth}
              opacity={0.6}
            />

            {/* Animated segments */}
            {arcs.map((arc) => (
              <g key={arc.id} transform={`rotate(${arc.rotation} ${cx} ${cy})`}>
                {/* Soft outer glow */}
                <circle
                  cx={cx}
                  cy={cy}
                  r={radius}
                  fill="none"
                  stroke={arc.color}
                  strokeWidth={strokeWidth + 6}
                  strokeDasharray={`${arc.length} ${arc.gap}`}
                  strokeLinecap="butt"
                  opacity={0.18}
                  style={{ filter: `blur(6px)` }}
                />
                {/* Actual segment */}
                <circle
                  cx={cx}
                  cy={cy}
                  r={radius}
                  fill="none"
                  stroke={arc.color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={`${arc.length} ${arc.gap}`}
                  strokeLinecap="butt"
                  style={{
                    strokeDashoffset: 0,
                    animation: `drawSegment 1s var(--ease) ${arc.delay}s both`,
                    transformOrigin: `${cx}px ${cy}px`,
                  }}
                >
                  <title>{`${arc.label}: ${arc.value}`}</title>
                </circle>
              </g>
            ))}

            {/* Center labels */}
            <text
              x={cx}
              y={cy - 12}
              textAnchor="middle"
              fill="var(--fg-dim)"
              fontSize="10"
              fontFamily="var(--font-mono)"
              letterSpacing="0.25em"
            >
              TOTAL
            </text>
            <text
              x={cx}
              y={cy + 18}
              textAnchor="middle"
              fill="var(--fg)"
              fontSize="42"
              fontWeight="700"
              fontFamily="var(--font-sans)"
              style={{ letterSpacing: "-0.04em" }}
            >
              {total}
            </text>
            <text
              x={cx}
              y={cy + 38}
              textAnchor="middle"
              fill={dominant?.color ?? "var(--fg-dim)"}
              fontSize="10"
              fontFamily="var(--font-mono)"
              letterSpacing="0.2em"
              style={{ textTransform: "uppercase" }}
            >
              {dominant?.label ?? "—"}
            </text>
          </svg>
        </div>

        {/* Legend with mini bars */}
        <ul className="w-full space-y-2" role="list">
          {allSegments.map((seg) => {
            const pct = (seg.value / total) * 100;
            const active = seg.value > 0;
            return (
              <li
                key={seg.id}
                className="relative flex items-center gap-3 py-2"
                style={{ opacity: active ? 1 : 0.3 }}
              >
                <span
                  className="inline-block h-2 w-2 rounded-full shrink-0"
                  style={{
                    background: seg.color,
                    boxShadow: active ? `0 0 6px ${seg.glow}` : "none",
                  }}
                />
                <span
                  className="text-sm flex-1"
                  style={{ color: active ? "var(--fg)" : "var(--fg-dim)" }}
                >
                  {seg.label}
                </span>
                {/* Percent bar */}
                <div
                  className="hidden sm:block relative h-1 rounded-full overflow-hidden shrink-0"
                  style={{
                    width: "90px",
                    background: "var(--border)",
                  }}
                >
                  <div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{
                      width: `${pct}%`,
                      background: seg.color,
                      boxShadow: active ? `0 0 4px ${seg.glow}` : "none",
                      transition: "width 0.9s var(--ease) 0.3s",
                    }}
                  />
                </div>
                <span
                  className="font-mono text-sm shrink-0 tabular-nums"
                  style={{
                    color: active ? "var(--fg)" : "var(--fg-dim)",
                    width: "1.75rem",
                    textAlign: "right",
                  }}
                >
                  {seg.value}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <style jsx>{`
        @keyframes drawSegment {
          from {
            opacity: 0;
            transform: scale(0.96);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </section>
  );
}
