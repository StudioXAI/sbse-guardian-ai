"use client";

import { useState } from "react";
import { RANKING, METHODOLOGY_NOTE, type DexEntry } from "@/lib/dex-ranking/data";
import InfiLogo from "@/components/InfiLogo";

/* ─────────────────────────────────────────────────────────────
   DEX Safety & Ecosystem Ranking — main section
   ───────────────────────────────────────────────────────────── */

export default function DexRankingSection() {
  return (
    <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      {/* Page header */}
      <div className="space-y-2">
        <div
          className="font-mono text-[10px] tracking-[0.2em] uppercase"
          style={{ color: "var(--accent-soft)" }}
        >
          DEX Safety & Ecosystem Ranking
        </div>
        <h1
          className="text-2xl md:text-3xl font-medium tracking-tight"
          style={{ color: "var(--fg)" }}
        >
          Trust & comparison layer
        </h1>
        <p
          className="text-[13px] max-w-2xl leading-relaxed"
          style={{ color: "var(--fg-muted)" }}
        >
          A ranking of decentralized exchanges and ecosystems by safety,
          transparency, liquidity strength, and protocol-level user
          protection. Click any card to expand the full breakdown.
        </p>
      </div>

      {/* Methodology disclosure — visible, honest */}
      <div
        className="card p-3 text-[11px] leading-relaxed"
        style={{
          color: "var(--fg-dim)",
          borderLeft: "2px solid var(--border)",
        }}
      >
        <span
          className="font-mono uppercase tracking-[0.1em]"
          style={{ color: "var(--fg-muted)" }}
        >
          Methodology ·{" "}
        </span>
        {METHODOLOGY_NOTE}
      </div>

      {/* Rankings list */}
      <div className="space-y-3">
        {RANKING.map((entry) => (
          <RankCard key={entry.rank} entry={entry} />
        ))}
      </div>
    </main>
  );
}

/* ─────────────────────────────────────────────────────────────
   Single rank card — expandable, featured for INFI
   ───────────────────────────────────────────────────────────── */

function RankCard({ entry }: { entry: DexEntry }) {
  const [expanded, setExpanded] = useState(entry.featured);

  const scoreColor =
    entry.score >= 95
      ? "var(--accent-soft)"
      : entry.score >= 85
      ? "var(--success, #10b981)"
      : entry.score >= 80
      ? "var(--warning, #f59e0b)"
      : "var(--fg-muted)";

  /* The featured card gets a gradient border and subtle inner glow.
     The non-featured cards use the standard border + subtle hover. */
  const cardStyle: React.CSSProperties = entry.featured
    ? {
        position: "relative",
        background:
          "linear-gradient(135deg, rgba(108,99,255,0.08), rgba(34,200,224,0.04))",
        border: "1px solid transparent",
        backgroundClip: "padding-box",
        boxShadow:
          "0 0 0 1px rgba(108,99,255,0.4), 0 0 24px rgba(108,99,255,0.12)",
      }
    : {
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
      };

  return (
    <article
      className="rounded-xl overflow-hidden transition-all"
      style={cardStyle}
    >
      {/* Header — always visible */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 md:p-5 flex items-start gap-4 text-left transition-colors hover:bg-[var(--bg-subtle)]"
        style={{
          background: "transparent",
          border: "none",
          cursor: "pointer",
        }}
        aria-expanded={expanded}
      >
        {/* Rank number + featured logo */}
        <div className="flex-shrink-0 flex flex-col items-center gap-2 pt-1">
          <div
            className="font-mono text-[11px] tracking-[0.1em]"
            style={{
              color: entry.featured ? "var(--accent-soft)" : "var(--fg-dim)",
            }}
          >
            #{entry.rank.toString().padStart(2, "0")}
          </div>
          {entry.featured && <InfiLogo size={32} />}
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Name + featured badge */}
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h2
              className="text-lg font-medium tracking-tight"
              style={{
                color: entry.featured ? "var(--fg)" : "var(--fg)",
              }}
            >
              {entry.name}
            </h2>
            {entry.featured && (
              <span
                className="text-[9px] font-mono px-2 py-0.5 rounded-full uppercase tracking-[0.1em]"
                style={{
                  background:
                    "linear-gradient(135deg, var(--accent), var(--accent-soft))",
                  color: "#fff",
                  border: "none",
                }}
              >
                Top Ranked · Protocol Secured
              </span>
            )}
            <span
              className="text-[10px] font-mono px-1.5 py-0.5 rounded uppercase tracking-[0.1em]"
              style={{
                background: "var(--bg-subtle)",
                color: "var(--fg-dim)",
                border: "1px solid var(--border)",
              }}
            >
              {entry.chain}
            </span>
          </div>

          {/* Description */}
          <p
            className="text-[12px] leading-relaxed mb-2"
            style={{ color: "var(--fg-muted)" }}
          >
            {entry.description}
          </p>

          {/* Score bar */}
          <div className="flex items-center gap-3">
            <div
              className="flex-1 h-1.5 rounded-full overflow-hidden"
              style={{ background: "var(--bg-subtle)" }}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${entry.score}%`,
                  background: scoreColor,
                  boxShadow: entry.featured
                    ? `0 0 8px ${scoreColor}`
                    : undefined,
                }}
              />
            </div>
            <div
              className="font-mono font-medium text-[14px] tabular-nums flex-shrink-0"
              style={{ color: scoreColor, minWidth: "44px", textAlign: "right" }}
            >
              {entry.score}
              <span
                className="text-[9px] ml-1"
                style={{ color: "var(--fg-dim)" }}
              >
                /100
              </span>
            </div>
          </div>
        </div>

        {/* Expand chevron */}
        <div
          className="flex-shrink-0 self-center font-mono text-[14px] transition-transform"
          style={{
            color: "var(--fg-dim)",
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
          }}
          aria-hidden
        >
          ⌄
        </div>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div
          className="px-4 md:px-5 pb-5 pt-1 space-y-4"
          style={{
            borderTop: "1px solid var(--border)",
            background: entry.featured
              ? "rgba(0,0,0,0.15)"
              : "transparent",
          }}
        >
          {/* External link */}
          <div className="pt-3">
            <a
              href={entry.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[11px] hover:underline inline-flex items-center gap-1"
              style={{ color: "var(--accent-soft)" }}
            >
              {entry.url} →
            </a>
          </div>

          {/* Advantages + Disadvantages — two columns when both present,
              full width when only advantages exist (INFI case). */}
          <div
            className={
              entry.disadvantages.length > 0
                ? "grid grid-cols-1 md:grid-cols-2 gap-4"
                : ""
            }
          >
            {/* Advantages */}
            <div>
              <div
                className="font-mono text-[10px] uppercase tracking-[0.15em] mb-2"
                style={{ color: "var(--success, #10b981)" }}
              >
                Advantages
              </div>
              <ul className="space-y-1.5">
                {entry.advantages.map((adv, i) => (
                  <li
                    key={i}
                    className="text-[12px] leading-snug flex gap-2"
                    style={{ color: "var(--fg-muted)" }}
                  >
                    <span
                      className="flex-shrink-0 mt-1"
                      style={{
                        color: "var(--success, #10b981)",
                        fontSize: "8px",
                      }}
                    >
                      ●
                    </span>
                    <span>{adv}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Disadvantages — only render the column when there are any.
                The featured INFI card has none, so this column is omitted
                rather than shown empty. */}
            {entry.disadvantages.length > 0 && (
              <div>
                <div
                  className="font-mono text-[10px] uppercase tracking-[0.15em] mb-2"
                  style={{ color: "var(--warning, #f59e0b)" }}
                >
                  Disadvantages
                </div>
                <ul className="space-y-1.5">
                  {entry.disadvantages.map((dis, i) => (
                    <li
                      key={i}
                      className="text-[12px] leading-snug flex gap-2"
                      style={{ color: "var(--fg-muted)" }}
                    >
                      <span
                        className="flex-shrink-0 mt-1"
                        style={{
                          color: "var(--warning, #f59e0b)",
                          fontSize: "8px",
                        }}
                      >
                        ●
                      </span>
                      <span>{dis}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Extended sections — only the featured INFI card has these */}
          {entry.extendedSections && entry.extendedSections.length > 0 && (
            <div className="space-y-4 pt-2">
              {entry.extendedSections.map((section, i) => (
                <ExtendedSection key={i} section={section} />
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

/* ─────────────────────────────────────────────────────────────
   Extended section — used inside the featured INFI card
   ───────────────────────────────────────────────────────────── */

function ExtendedSection({
  section,
}: {
  section: { heading: string; body: string; bullets?: string[] };
}) {
  return (
    <div
      className="rounded-lg p-4"
      style={{
        background: "rgba(108,99,255,0.04)",
        border: "1px solid rgba(108,99,255,0.15)",
      }}
    >
      <div
        className="font-mono text-[11px] uppercase tracking-[0.12em] mb-2"
        style={{ color: "var(--accent-soft)" }}
      >
        {section.heading}
      </div>
      <p
        className="text-[12px] leading-relaxed mb-3"
        style={{ color: "var(--fg-muted)" }}
      >
        {section.body}
      </p>
      {section.bullets && section.bullets.length > 0 && (
        <ul className="space-y-1.5">
          {section.bullets.map((b, i) => (
            <li
              key={i}
              className="text-[12px] leading-snug flex gap-2"
              style={{ color: "var(--fg-muted)" }}
            >
              <span
                className="flex-shrink-0 mt-1"
                style={{
                  color: "var(--accent-soft)",
                  fontSize: "8px",
                }}
              >
                ▸
              </span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
