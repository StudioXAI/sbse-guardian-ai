"use client";

import type { AuditReport } from "@/lib/types";

export default function RiskDonut({ report }: { report: AuditReport }) {
  /* Derive segment sizes from findings distribution */
  const bad = report.findings.filter((f) => f.severity === "bad").length;
  const warn = report.findings.filter((f) => f.severity === "warn").length;
  const good = report.findings.filter((f) => f.severity === "good").length;
  const info = report.findings.filter((f) => f.severity === "info").length;
  const total = bad + warn + good + info || 1;

  const segments = [
    { id: "good", label: "Clean", value: good, color: "#7ab87a" },
    { id: "info", label: "Info", value: info, color: "#6ea4d3" },
    { id: "warn", label: "Warnings", value: warn, color: "#f5a623" },
    { id: "bad", label: "Critical", value: bad, color: "#e86464" },
  ].filter((s) => s.value > 0);

  const size = 300;
  const strokeWidth = 28;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const cx = size / 2;
  const cy = size / 2;

  let accumulated = 0;
  const arcs = segments.map((seg, i) => {
    const pct = seg.value / total;
    const offset = circumference * (1 - pct);
    const rotation = (accumulated / total) * 360 - 90;
    accumulated += seg.value;
    return { ...seg, offset, rotation, delay: i * 0.12 };
  });

  return (
    <section
      className="rounded-[28px] border p-8 anim-fade-up"
      style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}
      aria-labelledby="donut-title"
    >
      <div className="flex items-baseline justify-between mb-6">
        <h3 id="donut-title" className="font-display italic text-2xl">
          Risk composition
        </h3>
        <span className="font-mono text-xs tracking-[0.2em] uppercase"
              style={{ color: "var(--fg-dim)" }}>
          {total} findings
        </span>
      </div>

      <div className="flex flex-col items-center gap-8">
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
            style={{ filter: "drop-shadow(0 0 30px rgba(245,166,35,0.08))" }}
          >
            {/* Track */}
            <circle
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke="rgba(255,249,240,0.06)"
              strokeWidth={strokeWidth}
            />

            {arcs.map((arc) => (
              <circle
                key={arc.id}
                cx={cx}
                cy={cy}
                r={radius}
                fill="none"
                stroke={arc.color}
                strokeWidth={strokeWidth}
                strokeDasharray={circumference}
                strokeDashoffset={arc.offset}
                strokeLinecap="butt"
                transform={`rotate(${arc.rotation} ${cx} ${cy})`}
                style={{
                  animation: `fadeIn 0.8s ease-out ${arc.delay}s both`,
                }}
              >
                <title>{`${arc.label}: ${arc.value}`}</title>
              </circle>
            ))}

            {/* Center labels */}
            <text
              x={cx}
              y={cy - 8}
              textAnchor="middle"
              fill="var(--fg-dim)"
              fontSize="11"
              fontFamily="var(--font-mono)"
              letterSpacing="0.2em"
            >
              TOTAL
            </text>
            <text
              x={cx}
              y={cy + 26}
              textAnchor="middle"
              fill="var(--fg)"
              fontSize="44"
              fontWeight="500"
              fontFamily="var(--font-display)"
              fontStyle="italic"
            >
              {total}
            </text>
          </svg>
        </div>

        {/* Legend */}
        <ul className="w-full grid grid-cols-2 gap-3" role="list">
          {segments.map((seg) => (
            <li
              key={seg.id}
              className="flex items-center justify-between gap-3 px-4 py-2 rounded-lg"
              style={{ background: "var(--bg-overlay)" }}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ background: seg.color }}
                />
                <span className="text-sm truncate" style={{ color: "var(--fg-muted)" }}>
                  {seg.label}
                </span>
              </div>
              <span className="font-mono text-sm shrink-0" style={{ color: "var(--fg)" }}>
                {seg.value}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
