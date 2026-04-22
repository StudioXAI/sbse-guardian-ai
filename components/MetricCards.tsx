"use client";

import type { AuditReport } from "@/lib/types";

export default function MetricCards({ report }: { report: AuditReport }) {
  const metrics = [
    {
      label: "Risk Score",
      value: `${report.riskScore}`,
      suffix: "/10",
      sub: report.riskScore <= 3 ? "Low" : report.riskScore <= 6 ? "Moderate" : "High",
      color:
        report.riskScore <= 3
          ? "var(--green)"
          : report.riskScore <= 6
          ? "var(--amber)"
          : "var(--red)",
    },
    {
      label: "Rug Probability",
      value: `${report.rugPullProbability}`,
      suffix: "%",
      sub: String(report.rugPullRisk),
      color:
        report.rugPullProbability < 30
          ? "var(--green)"
          : report.rugPullProbability < 50
          ? "var(--amber)"
          : "var(--red)",
    },
    {
      label: "Security Grade",
      value: report.grade,
      suffix: "",
      sub: report.professionalLabel,
      color: ["A+", "A"].includes(report.grade)
        ? "var(--green)"
        : ["B", "C"].includes(report.grade)
        ? "var(--amber)"
        : "var(--red)",
    },
    {
      label: "Professional",
      value: `${report.professionalScore}`,
      suffix: "/10",
      sub: report.verified ? "Source verified" : "Unverified source",
      color: report.professionalScore >= 7 ? "var(--green)" : "var(--amber)",
    },
  ];

  return (
    <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
      {metrics.map((m, i) => (
        <div
          key={m.label}
          className="rounded-2xl border p-5 anim-fade-up"
          style={{
            borderColor: "var(--border)",
            background: "var(--bg-elevated)",
            animationDelay: `${i * 0.05}s`,
          }}
        >
          <div className="font-mono text-[10px] tracking-[0.25em] uppercase mb-3"
               style={{ color: "var(--fg-dim)" }}>
            {m.label}
          </div>
          <div className="flex items-baseline gap-1">
            <span
              className="font-display italic text-4xl leading-none"
              style={{ color: m.color }}
            >
              {m.value}
            </span>
            {m.suffix && (
              <span className="font-mono text-base" style={{ color: "var(--fg-dim)" }}>
                {m.suffix}
              </span>
            )}
          </div>
          <div className="text-xs mt-3" style={{ color: m.color }}>
            {m.sub}
          </div>
        </div>
      ))}
    </div>
  );
}
