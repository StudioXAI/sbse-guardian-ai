"use client";

import { useState } from "react";
import type { AuditReport, Finding } from "@/lib/types";

const SEVERITY_STYLES: Record<
  Finding["severity"],
  { color: string; bg: string; border: string; glow: string; icon: string; label: string }
> = {
  good: {
    color: "var(--success)",
    bg: "var(--success-dim)",
    border: "rgba(74,222,128,0.22)",
    glow: "rgba(74,222,128,0.4)",
    icon: "✓",
    label: "CLEAN",
  },
  info: {
    color: "var(--info)",
    bg: "var(--info-dim)",
    border: "rgba(96,165,250,0.22)",
    glow: "rgba(96,165,250,0.35)",
    icon: "ı",
    label: "INFO",
  },
  warn: {
    color: "var(--warning)",
    bg: "var(--warning-dim)",
    border: "rgba(250,204,21,0.28)",
    glow: "rgba(250,204,21,0.4)",
    icon: "!",
    label: "WARNING",
  },
  bad: {
    color: "var(--danger)",
    bg: "var(--danger-dim)",
    border: "rgba(248,113,113,0.3)",
    glow: "rgba(248,113,113,0.4)",
    icon: "×",
    label: "CRITICAL",
  },
};

const ORDER: Finding["severity"][] = ["bad", "warn", "good", "info"];

const URL_REGEX = /^https?:\/\/[^\s<>]+$/i;
const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

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
      className="card p-8 anim-fade-up"
      aria-labelledby="findings-title"
    >
      <div className="flex items-baseline justify-between gap-4 mb-5">
        <h3
          id="findings-title"
          className="text-xl font-semibold tracking-tight"
          style={{ color: "var(--fg)", letterSpacing: "-0.02em" }}
        >
          Findings
        </h3>
        <span className="label-xs">{report.findings.length} total</span>
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
              className="flex items-start gap-3 p-4 rounded-xl border anim-fade-up"
              style={{
                background: s.bg,
                borderColor: s.border,
                animationDelay: `${Math.min(i * 0.025, 0.3)}s`,
              }}
            >
              <span
                className="shrink-0 h-6 w-6 rounded-full flex items-center justify-center font-mono text-xs font-bold"
                style={{
                  background: s.color,
                  color: "var(--bg)",
                  boxShadow: `0 0 10px ${s.glow}`,
                }}
                aria-hidden
              >
                {s.icon}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm leading-snug" style={{ color: "var(--fg)" }}>
                  {f.label}
                </div>
                {f.detail && (
                  <div
                    className="text-xs mt-1 break-words"
                    style={{ color: "var(--fg-muted)" }}
                  >
                    {renderDetail(f.detail, s.color)}
                  </div>
                )}
              </div>
            </li>
          );
        })}
        {visible.length === 0 && (
          <li className="py-10 text-center text-sm" style={{ color: "var(--fg-dim)" }}>
            No findings in this category.
          </li>
        )}
      </ul>
    </section>
  );
}

/**
 * Render finding detail, linkifying URLs and addresses.
 * URLs become clickable links. Addresses get monospace styling.
 */
function renderDetail(detail: string, accentColor: string): React.ReactNode {
  const trimmed = detail.trim();

  // Single URL detail — render as a prominent link
  if (URL_REGEX.test(trimmed)) {
    return (
      <a
        href={trimmed}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 font-mono hover:underline transition-opacity hover:opacity-80"
        style={{ color: accentColor, wordBreak: "break-all" }}
      >
        <span>{trimmed}</span>
        <ExternalIcon />
      </a>
    );
  }

  // Detail that contains a URL alongside text — linkify inline
  const urlMatch = trimmed.match(/(https?:\/\/[^\s<>]+)/);
  if (urlMatch) {
    const parts = trimmed.split(urlMatch[0]);
    return (
      <>
        <span>{parts[0]}</span>
        <a
          href={urlMatch[0]}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-mono hover:underline"
          style={{ color: accentColor, wordBreak: "break-all" }}
        >
          {urlMatch[0]}
          <ExternalIcon />
        </a>
        <span>{parts[1]}</span>
      </>
    );
  }

  // Single address detail
  if (ADDRESS_REGEX.test(trimmed)) {
    return (
      <span className="font-mono" style={{ color: "var(--fg)" }}>
        {trimmed}
      </span>
    );
  }

  return <>{detail}</>;
}

function ExternalIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M7 17L17 7" />
      <path d="M7 7h10v10" />
    </svg>
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
      className="px-3 py-1.5 rounded-full font-mono text-[11px] tracking-[0.1em] transition-all hover:brightness-110"
      style={{
        background: active ? color || "var(--fg)" : "transparent",
        color: active ? "var(--bg)" : color || "var(--fg-muted)",
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: active ? color || "var(--fg)" : "var(--border)",
      }}
    >
      {label} <span style={{ opacity: 0.7 }}>· {count}</span>
    </button>
  );
}
