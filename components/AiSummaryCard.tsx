"use client";

import type { AuditReport } from "@/lib/types";

/**
 * AI Analyst summary card.
 * Renders Claude-generated plain-English explanation of findings.
 * If aiSummary is null (API unavailable or disabled), this component
 * returns null and the section is hidden entirely.
 */
export default function AiSummaryCard({ report }: { report: AuditReport }) {
  const ai = report.aiSummary;
  if (!ai) return null;

  return (
    <section
      className="card card-glow relative overflow-hidden anim-fade-up"
      style={{
        padding: "32px 36px",
        background:
          "linear-gradient(180deg, rgba(108,99,255,0.04), transparent 60%)",
      }}
      aria-labelledby="ai-summary-title"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
        <span
          className="inline-flex items-center gap-2 label-sm"
          style={{ color: "var(--accent-soft)" }}
        >
          <SparkleIcon />
          AI Analyst · Claude
        </span>
        <span className="label-xs">Plain English</span>
      </div>

      {/* Verdict line */}
      <h2
        id="ai-summary-title"
        className="text-gradient mb-5"
        style={{
          fontSize: "clamp(22px, 3vw, 30px)",
          fontWeight: 600,
          lineHeight: 1.2,
          letterSpacing: "-0.02em",
        }}
      >
        {ai.verdict}
      </h2>

      {/* Paragraphs */}
      <div
        className="space-y-4"
        style={{
          fontSize: "16px",
          lineHeight: 1.7,
          color: "var(--fg)",
        }}
      >
        {ai.paragraphs.map((p, i) => (
          <p key={i}>{renderWithBold(p)}</p>
        ))}
      </div>

      {/* Bottom line highlight */}
      <div
        className="mt-6 pt-5 border-t"
        style={{ borderColor: "var(--border)" }}
      >
        <p
          style={{
            fontSize: "16px",
            lineHeight: 1.6,
            color: "var(--accent-soft)",
            fontWeight: 500,
          }}
        >
          {ai.bottomLine}
        </p>
      </div>

      {/* Disclaimer */}
      <div
        className="mt-5 pt-4 border-t font-mono"
        style={{
          borderColor: "var(--border)",
          fontSize: "11px",
          color: "var(--fg-dim)",
          lineHeight: 1.6,
        }}
      >
        AI-generated from verified on-chain data. Not financial advice.
        SbSe Guardian flags patterns; it does not predict prices.
      </div>
    </section>
  );
}

/**
 * Render text with **bold** markers converted to styled spans.
 * Simple parser — no full markdown. Handles the only syntax Claude uses.
 */
function renderWithBold(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong
          key={i}
          style={{ color: "var(--accent-soft)", fontWeight: 500 }}
        >
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function SparkleIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3L13.5 8.5L19 10L13.5 11.5L12 17L10.5 11.5L5 10L10.5 8.5L12 3Z" />
      <path d="M5 3L5.75 5L7.75 5.75L5.75 6.5L5 8.5L4.25 6.5L2.25 5.75L4.25 5L5 3Z" />
      <path d="M19 13L19.75 15L21.75 15.75L19.75 16.5L19 18.5L18.25 16.5L16.25 15.75L18.25 15L19 13Z" />
    </svg>
  );
}
