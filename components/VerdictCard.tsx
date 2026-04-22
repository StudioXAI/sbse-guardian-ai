"use client";

import type { AuditReport } from "@/lib/types";

const STYLE_MAP: Record<
  AuditReport["verdict"]["label"],
  { border: string; bg: string; text: string; icon: string; accent: string }
> = {
  INSTITUTIONAL: {
    border: "rgba(245,166,35,0.3)",
    bg: "linear-gradient(135deg, rgba(245,166,35,0.08), rgba(245,166,35,0.02))",
    text: "var(--amber)",
    icon: "◈",
    accent: "var(--amber)",
  },
  SAFE: {
    border: "rgba(122,184,122,0.3)",
    bg: "linear-gradient(135deg, rgba(122,184,122,0.08), rgba(122,184,122,0.02))",
    text: "var(--green)",
    icon: "◉",
    accent: "var(--green)",
  },
  CAUTION: {
    border: "rgba(245,166,35,0.35)",
    bg: "linear-gradient(135deg, rgba(245,166,35,0.1), rgba(245,166,35,0.02))",
    text: "var(--amber)",
    icon: "◐",
    accent: "var(--amber)",
  },
  "HIGH RISK": {
    border: "rgba(232,100,100,0.4)",
    bg: "linear-gradient(135deg, rgba(232,100,100,0.1), rgba(232,100,100,0.02))",
    text: "var(--red)",
    icon: "◆",
    accent: "var(--red)",
  },
};

export default function VerdictCard({ report }: { report: AuditReport }) {
  const style = STYLE_MAP[report.verdict.label] ?? STYLE_MAP.SAFE;

  return (
    <section
      className="relative overflow-hidden rounded-[28px] border p-8 md:p-12 anim-fade-up"
      style={{
        borderColor: style.border,
        background: style.bg,
      }}
      aria-labelledby="verdict-label"
    >
      {/* Top metadata strip */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3 font-mono text-xs tracking-[0.2em] uppercase"
             style={{ color: "var(--fg-muted)" }}>
          <span>Scan Verdict</span>
          <span style={{ color: "var(--fg-dim)" }}>·</span>
          <span>{report.chain}</span>
          <span style={{ color: "var(--fg-dim)" }}>·</span>
          <span>{report.tokenType}</span>
        </div>
        <div className="flex items-center gap-2 font-mono text-xs"
             style={{ color: "var(--fg-muted)" }}>
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: style.accent, animation: "pulse 2s ease-in-out infinite" }}
          />
          <span>Confidence {report.confidence}%</span>
        </div>
      </div>

      {/* Main verdict */}
      <div className="flex items-start gap-6">
        <div
          className="shrink-0 text-5xl md:text-6xl leading-none"
          style={{ color: style.accent }}
          aria-hidden
        >
          {style.icon}
        </div>

        <div className="flex-1 min-w-0">
          <p
            id="verdict-label"
            className="font-mono text-xs tracking-[0.3em] uppercase mb-3"
            style={{ color: style.text }}
          >
            {report.verdict.label}
          </p>
          <h2 className="font-display italic text-4xl md:text-6xl leading-[1.05] tracking-tight mb-5"
              style={{ color: "var(--fg)" }}>
            {report.verdict.headline}.
          </h2>
          <p className="text-lg md:text-xl leading-relaxed max-w-3xl"
             style={{ color: "var(--fg-muted)" }}>
            {report.verdict.plainEnglish}
          </p>
        </div>
      </div>

      {/* Bottom context row */}
      <div className="mt-10 flex flex-wrap gap-x-10 gap-y-4 pt-6 border-t"
           style={{ borderColor: "var(--border)" }}>
        <MetaItem label="Project" value={report.project} />
        <MetaItem label="Symbol" value={report.verified ? "VERIFIED" : "UNVERIFIED"} mono />
        <MetaItem label="Grade" value={report.grade} mono accent={style.accent} />
        <MetaItem
          label="Rug Pull"
          value={`${report.rugPullProbability}% — ${report.rugPullRisk}`}
          mono
        />
      </div>
    </section>
  );
}

function MetaItem({
  label,
  value,
  mono,
  accent,
}: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: string;
}) {
  return (
    <div>
      <div className="font-mono text-[10px] tracking-[0.25em] uppercase mb-1"
           style={{ color: "var(--fg-dim)" }}>
        {label}
      </div>
      <div
        className={`${mono ? "font-mono" : ""} text-sm`}
        style={{ color: accent || "var(--fg)" }}
      >
        {value}
      </div>
    </div>
  );
}
