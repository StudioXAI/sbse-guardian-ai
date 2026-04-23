"use client";

import type { AuditReport } from "@/lib/types";

const VERDICT_STYLES: Record<
  AuditReport["verdict"]["label"],
  {
    color: string;
    bgGradient: string;
    borderColor: string;
    label: string;
  }
> = {
  INSTITUTIONAL: {
    color: "var(--accent)",
    bgGradient:
      "linear-gradient(135deg, rgba(108,99,255,0.08), rgba(108,99,255,0.02) 60%)",
    borderColor: "rgba(108,99,255,0.25)",
    label: "Institutional",
  },
  SAFE: {
    color: "var(--success)",
    bgGradient:
      "linear-gradient(135deg, rgba(74,222,128,0.08), rgba(74,222,128,0.02) 60%)",
    borderColor: "rgba(74,222,128,0.22)",
    label: "Safe",
  },
  CAUTION: {
    color: "var(--warning)",
    bgGradient:
      "linear-gradient(135deg, rgba(250,204,21,0.08), rgba(250,204,21,0.02) 60%)",
    borderColor: "rgba(250,204,21,0.25)",
    label: "Caution",
  },
  "HIGH RISK": {
    color: "var(--danger)",
    bgGradient:
      "linear-gradient(135deg, rgba(248,113,113,0.1), rgba(248,113,113,0.02) 60%)",
    borderColor: "rgba(248,113,113,0.3)",
    label: "High Risk",
  },
};

export default function VerdictCard({ report }: { report: AuditReport }) {
  const style = VERDICT_STYLES[report.verdict.label] ?? VERDICT_STYLES.SAFE;

  return (
    <section
      className="relative overflow-hidden rounded-xl border p-8 md:p-10 anim-fade-up"
      style={{
        borderColor: style.borderColor,
        background: style.bgGradient,
      }}
      aria-labelledby="verdict-label"
    >
      {/* Meta strip */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div
          className="flex items-center gap-3 label-xs"
          style={{ color: "var(--fg-muted)" }}
        >
          <span>Verdict</span>
          <span style={{ color: "var(--fg-dim)" }}>/</span>
          <span>{report.chain}</span>
          <span style={{ color: "var(--fg-dim)" }}>/</span>
          <span>{report.tokenType}</span>
        </div>
        <div className="flex items-center gap-2 label-xs" style={{ color: "var(--fg-muted)" }}>
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{
              background: style.color,
              animation: "pulse 2.2s ease-in-out infinite",
            }}
          />
          <span>Confidence {report.confidence}%</span>
        </div>
      </div>

      {/* Verdict headline */}
      <div className="mb-8">
        <div
          id="verdict-label"
          className="label-sm mb-4"
          style={{ color: style.color }}
        >
          {style.label}
        </div>
        <h1
          className="text-gradient tracking-tight leading-[1.05]"
          style={{
            fontSize: "clamp(32px, 5.2vw, 60px)",
            fontWeight: 600,
            letterSpacing: "-0.03em",
          }}
        >
          {report.verdict.headline}
        </h1>
        <p
          className="mt-5 leading-relaxed max-w-3xl"
          style={{
            fontSize: "17px",
            color: "var(--fg-muted)",
          }}
        >
          {report.verdict.plainEnglish}
        </p>
      </div>

      {/* Meta grid */}
      <div
        className="grid gap-x-10 gap-y-4 pt-6 border-t"
        style={{
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          borderColor: "var(--border)",
        }}
      >
        <MetaItem label="Project" value={report.project} />
        <MetaItem
          label="Source"
          value={report.verified ? "Verified" : "Unverified"}
          mono
        />
        <MetaItem
          label="Grade"
          value={report.grade}
          mono
          accent={style.color}
        />
        <MetaItem
          label="Rug Pull"
          value={`${report.rugPullProbability}% · ${report.rugPullRisk}`}
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
      <div
        className="label-xs mb-1.5"
        style={{ color: "var(--fg-dim)" }}
      >
        {label}
      </div>
      <div
        className={mono ? "font-mono text-sm" : "text-sm"}
        style={{ color: accent || "var(--fg)" }}
      >
        {value}
      </div>
    </div>
  );
}
