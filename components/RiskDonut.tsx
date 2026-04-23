"use client";

import type { AuditReport, Finding } from "@/lib/types";

/**
 * Risk Composition donut — Batch 5A fix:
 * Big TOTAL number now scales based on digit count so multi-digit
 * numbers don't overflow the inner hole of the donut.
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
    { id: "bad",  label: "Critical", value: bad,  color: "#f87171", glow: "rgba(248,113,113,0.45)" },
    { id: "warn", label: "Warnings", value: warn, color: "#facc15", glow: "rgba(250,204,21,0.35)" },
    { id: "info", label: "Info",     value: info, color: "#60a5fa", glow: "rgba(96,165,250,0.35)" },
    { id: "good", label: "Clean",    value: good, color: "#4ade80", glow: "rgba(74,222,128,0.35)" },
  ];

  const segments = allSegments.filter((s) => s.value > 0);

  const size = 280;
  const strokeWidth = 28;
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
    return { ...seg, length, gap, rotation, delay: i * 0.15, pct };
  });

  const dominant = segments.reduce(
    (max, s) => (s.value > max.value ? s : max),
    segments[0] || allSegments[3],
  );

  // Responsive TOTAL font size — prevents overflow when total has many digits
  const totalDigits = String(total).length;
  const totalFontSize = totalDigits >= 4 ? 40 : totalDigits === 3 ? 48 : 58;

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
          background: `radial-gradient(circle at 50% 45%, ${
            dominant?.glow ?? "rgba(108,99,255,0.1)"
          }, transparent 55%)`,
          opacity: 0.5,
        }}
      />

      <div className="relative flex items-baseline justify-between gap-4 mb-7">
        <h3
          id="donut-title"
          className="text-xl font-semibold tracking-tight"
          style={{ color: "var(--fg)", letterSpacing: "-0.02em" }}
        >
          Risk Composition
        </h3>
        <span className="label-xs" style={{ color: "var(--fg-muted)" }}>
          {total} findings
        </span>
      </div>

      <div className="relative flex flex-col items-center gap-7">
        <div
          className="relative"
          role="img"
          aria-label={`Risk composition: ${segments
            .map((s) => `${s.label} ${s.value}`)
            .join(", ")}`}
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
              stroke="rgba(255,255,255,0.08)"
              strokeWidth={strokeWidth}
            />

            {/* Animated segments */}
            {arcs.map((arc) => (
              <g
                key={arc.id}
                transform={`rotate(${arc.rotation} ${cx} ${cy})`}
                style={{
                  animation: `drawSegment 0.9s var(--ease) ${arc.delay}s both`,
                }}
              >
                <circle
                  cx={cx}
                  cy={cy}
                  r={radius}
                  fill="none"
                  stroke={arc.color}
                  strokeWidth={strokeWidth + 8}
                  strokeDasharray={`${arc.length} ${arc.gap}`}
                  strokeLinecap="butt"
                  opacity={0.22}
                  style={{ filter: "blur(6px)" }}
                />
                <circle
                  cx={cx}
                  cy={cy}
                  r={radius}
                  fill="none"
                  stroke={arc.color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={`${arc.length} ${arc.gap}`}
                  strokeLinecap="butt"
                >
                  <title>{`${arc.label}: ${arc.value} (${(arc.pct * 100).toFixed(0)}%)`}</title>
                </circle>
              </g>
            ))}

            {/* Center labels — clamp font size so we don't overflow */}
            <text
              x={cx}
              y={cy - 22}
              textAnchor="middle"
              fill="rgba(237,237,237,0.6)"
              fontSize="10"
              fontFamily="var(--font-mono)"
              letterSpacing="0.3em"
              style={{ textTransform: "uppercase" }}
            >
              TOTAL
            </text>
            <text
              x={cx}
              y={cy + 14}
              textAnchor="middle"
              fill="#ffffff"
              fontSize={totalFontSize}
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
              fill={dominant?.color ?? "var(--fg-muted)"}
              fontSize="11"
              fontFamily="var(--font-mono)"
              letterSpacing="0.25em"
              fontWeight="500"
              style={{ textTransform: "uppercase" }}
            >
              {segments.length
                ? `${dominant.label} · ${Math.round((dominant.value / total) * 100)}%`
                : "—"}
            </text>
          </svg>
        </div>

        {/* Legend */}
        <ul className="w-full space-y-2" role="list">
          {allSegments.map((seg) => {
            const pct = (seg.value / total) * 100;
            const active = seg.value > 0;
            return (
              <li
                key={seg.id}
                className="relative flex items-center gap-3 py-2"
                style={{ opacity: active ? 1 : 0.35 }}
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                  style={{
                    background: seg.color,
                    boxShadow: active ? `0 0 8px ${seg.glow}` : "none",
                  }}
                />
                <span
                  className="text-sm flex-1"
                  style={{ color: active ? "var(--fg)" : "var(--fg-dim)" }}
                >
                  {seg.label}
                </span>
                <div
                  className="hidden sm:block relative h-1 rounded-full overflow-hidden shrink-0"
                  style={{ width: "90px", background: "var(--border)" }}
                >
                  <div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{
                      width: `${pct}%`,
                      background: seg.color,
                      boxShadow: active ? `0 0 6px ${seg.glow}` : "none",
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
            transform: scale(0.92);
            transform-origin: center;
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
