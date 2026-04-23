"use client";

import type { AuditReport } from "@/lib/types";

export default function MetricCards({ report }: { report: AuditReport }) {
  const metrics: Array<{
    label: string;
    value: string;
    suffix?: string;
    sub: string;
    tone: "good" | "warn" | "bad";
    fillPct: number;
  }> = [
    {
      label: "Risk Score",
      value: `${report.riskScore}`,
      suffix: "/10",
      sub:
        report.riskScore <= 3
          ? "Low"
          : report.riskScore <= 6
          ? "Moderate"
          : "High",
      tone:
        report.riskScore <= 3 ? "good" : report.riskScore <= 6 ? "warn" : "bad",
      fillPct: report.riskScore * 10,
    },
    {
      label: "Rug Probability",
      value: `${report.rugPullProbability}`,
      suffix: "%",
      sub: String(report.rugPullRisk),
      tone:
        report.rugPullProbability < 30
          ? "good"
          : report.rugPullProbability < 50
          ? "warn"
          : "bad",
      fillPct: report.rugPullProbability,
    },
    {
      label: "Security Grade",
      value: report.grade,
      sub: report.professionalLabel,
      tone: ["A+", "A"].includes(report.grade)
        ? "good"
        : ["B", "C"].includes(report.grade)
        ? "warn"
        : "bad",
      fillPct: gradeToPct(report.grade),
    },
    {
      label: "Professional",
      value: `${report.professionalScore}`,
      suffix: "/10",
      sub: report.verified ? "Source verified" : "Unverified source",
      tone: report.professionalScore >= 7 ? "good" : "warn",
      fillPct: report.professionalScore * 10,
    },
  ];

  return (
    <div
      className="grid gap-3"
      style={{
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
      }}
    >
      {metrics.map((m, i) => (
        <MetricCard key={m.label} {...m} delay={i * 0.04} />
      ))}
    </div>
  );
}

function MetricCard({
  label,
  value,
  suffix,
  sub,
  tone,
  fillPct,
  delay,
}: {
  label: string;
  value: string;
  suffix?: string;
  sub: string;
  tone: "good" | "warn" | "bad";
  fillPct: number;
  delay: number;
}) {
  const toneColor = {
    good: "var(--success)",
    warn: "var(--warning)",
    bad: "var(--danger)",
  }[tone];

  return (
    <div
      className="card card-hover anim-fade-up"
      style={{
        padding: "20px 22px",
        position: "relative",
        animationDelay: `${delay}s`,
      }}
    >
      <div className="label-xs mb-4">{label}</div>
      <div className="flex items-baseline gap-1">
        <span
          className="tracking-tight"
          style={{
            fontSize: "40px",
            fontWeight: 600,
            color: toneColor,
            lineHeight: 1,
            letterSpacing: "-0.03em",
          }}
        >
          {value}
        </span>
        {suffix && (
          <span
            className="font-mono"
            style={{ fontSize: "14px", color: "var(--fg-dim)" }}
          >
            {suffix}
          </span>
        )}
      </div>
      <div
        className="mt-3 text-xs"
        style={{ color: toneColor }}
      >
        {sub}
      </div>
      {/* Progress bar at bottom */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "2px",
          background: "var(--border)",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${Math.min(Math.max(fillPct, 2), 100)}%`,
            background: toneColor,
            transition: "width 0.8s var(--ease)",
          }}
        />
      </div>
    </div>
  );
}

function gradeToPct(g: string): number {
  const map: Record<string, number> = {
    "A+": 100,
    A: 92,
    B: 78,
    C: 60,
    D: 40,
    F: 20,
  };
  return map[g] ?? 50;
}
