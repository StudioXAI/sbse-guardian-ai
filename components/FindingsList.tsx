"use client";

import { useState } from "react";
import type { AuditReport, Finding } from "@/lib/types";

const SEVERITY_STYLES: Record<
  Finding["severity"],
  { color: string; bg: string; border: string; icon: string; label: string }
> = {
  good: {
    color: "var(--green)",
    bg: "var(--green-dim)",
    border: "rgba(122,184,122,0.25)",
    icon: "✓",
    label: "CLEAN",
  },
  info: {
    color: "var(--blue)",
    bg: "var(--blue-dim)",
    border: "rgba(110,164,211,0.25)",
    icon: "◦",
    label: "INFO",
  },
  warn: {
    color: "var(--amber)",
    bg: "var(--amber-dim)",
    border: "rgba(245,166,35,0.28)",
    icon: "!",
    label: "WARNING",
  },
  bad: {
    color: "var(--red)",
    bg: "var(--red-dim)",
    border: "rgba(232,100,100,0.3)",
    icon: "×",
    label: "CRITICAL",
  },
};

const ORDER: Finding["severity"][] = ["bad", "warn", "good", "info"];

export default function FindingsList({ report }: { report: AuditReport }) {
  const [filter, setFilter] = useState<Finding["severity"] | "all">("all");

  const visible =
    filter === "all" ? report.findings : report.findings.filter((f) => f.severity === filter);

  const counts = {
    all: report.findings.length,
    bad: report.findings.filter((f) => f.severity === "bad").length,
    warn: report.findings.filter((f) => f.severity === "warn").length,
    good: report.findings.filter((f) => f.severity === "good").length,
    info: report.findings.filter((f) => f.severity === "info").length,
  };

  return (
    <section
      className="rounded-[28px] border p-8 anim-fade-up"
      style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}
      aria-labelledby="findings-title"
    >
      <div className="flex items-baseline justify-between mb-6">
        <h3 id="findings-title" className="font-display italic text-2xl">
          Findings
        </h3>
        <span className="font-mono text-xs tracking-[0.2em] uppercase"
              style={{ color: "var(--fg-dim)" }}>
          {report.findings.length} total
        </span>
      </div>

      {/* Severity filter */}
      <div className="flex flex-wrap gap-2 mb-6" role="tablist" aria-label="Filter findings">
        <FilterChip
          label="All"
          count={counts.all}
          active={filter === "all"}
          onClick={() => setFilter("all")}
        />
        {ORDER.filter((s) => counts[s] > 0).map((sev) => (
          <FilterChip
            key={sev}
            label={SEVERITY_STYLES[sev].label}
            count={counts[sev]}
            color={SEVERITY_STYLES[sev].color}
            active={filter === sev}
            onClick={() => setFilter(sev)}
          />
        ))}
      </div>

      {/* Findings list */}
      <ul className="space-y-2" role="list">
        {visible.map((f, i) => {
          const s = SEVERITY_STYLES[f.severity];
          return (
            <li
              key={`${f.label}-${i}`}
              className="flex items-start gap-3 p-4 rounded-xl border anim-slide-in"
              style={{
                background: s.bg,
                borderColor: s.border,
                animationDelay: `${Math.min(i * 0.03, 0.4)}s`,
              }}
            >
              <span
                className="shrink-0 h-6 w-6 rounded-full flex items-center justify-center font-mono text-xs"
                style={{
                  background: s.color,
                  color: "var(--bg)",
                }}
                aria-hidden
              >
                {s.icon}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm" style={{ color: "var(--fg)" }}>
                  {f.label}
                </div>
                {f.detail && (
                  <div className="text-xs mt-1" style={{ color: "var(--fg-muted)" }}>
                    {f.detail}
                  </div>
                )}
              </div>
            </li>
          );
        })}
        {visible.length === 0 && (
          <li className="py-8 text-center text-sm" style={{ color: "var(--fg-dim)" }}>
            No findings in this category.
          </li>
        )}
      </ul>
    </section>
  );
}

function FilterChip({
  label,
  count,
  color,
  active,
  onClick,
}: {
  label: string;
  count: number;
  color?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="tab"
      aria-selected={active}
      className="px-3 py-1.5 rounded-full font-mono text-[11px] tracking-[0.15em] transition-all"
      style={{
        background: active ? (color || "var(--fg)") : "transparent",
        color: active ? "var(--bg)" : color || "var(--fg-muted)",
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: active ? (color || "var(--fg)") : "var(--border)",
      }}
    >
      {label} <span style={{ opacity: 0.7 }}>· {count}</span>
    </button>
  );
}
