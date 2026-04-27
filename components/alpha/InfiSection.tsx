"use client";

import { useEffect, useState } from "react";
import type { SocialPost } from "@/lib/alpha/types";
import { alphaGet } from "@/lib/alpha/client";
import { timeAgo } from "@/lib/alpha/format";

const INFI_X_URL = "https://x.com/INFI_MultiChain";
const INFI_LINKEDIN_URL = "https://www.linkedin.com/company/infi-multichain-cdex/";

export default function InfiSection() {
  const [latest, setLatest] = useState<SocialPost[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const data = await alphaGet<SocialPost[]>("/api/alpha/social");
      if (!cancelled) setLatest(data ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-5">
      {/* INFI Decentralized Blockchain — concept stage */}
      <div
        className="card p-5"
        style={{ borderLeft: "3px solid var(--info)" }}
      >
        <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
          <div className="label-xs" style={{ color: "var(--info)" }}>
            INFI Decentralized Blockchain
          </div>
          <span
            className="text-[10px] px-2 py-1 rounded-full font-mono"
            style={{
              background: "var(--info-dim)",
              color: "var(--info)",
              letterSpacing: "0.05em",
              border: "1px solid rgba(96,165,250,0.25)",
            }}
          >
            CONCEPT STAGE · NO LAUNCH DATE
          </span>
        </div>
        <p className="text-[14px] leading-relaxed" style={{ color: "var(--fg)" }}>
          The native INFI blockchain is currently in <strong style={{ color: "var(--info)" }}>concept stage</strong> — no launch date is confirmed. Architecture exploration and technical design are in progress. When announced, it is intended to use InvertX as the underlying liquidity gas mechanism and SbSe Protocol for autonomous governance.
        </p>
        <p className="text-[12px] leading-relaxed mt-3" style={{ color: "var(--fg-muted)" }}>
          Follow the official INFI MultiChain channels below for the first signal of any
          design publication, testnet announcement, or launch window.
        </p>
      </div>

      {/* InvertX — upcoming Q2-Q3 2026 */}
      <div
        className="card p-5"
        style={{ borderLeft: "3px solid var(--warning)" }}
      >
        <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
          <div className="label-xs" style={{ color: "var(--warning)" }}>
            InvertX · Decentralized Liquidity Engine
          </div>
          <span
            className="text-[10px] px-2 py-1 rounded-full font-mono"
            style={{
              background: "var(--warning-dim)",
              color: "var(--warning)",
              letterSpacing: "0.05em",
              border: "1px solid rgba(250,204,21,0.25)",
            }}
          >
            UPCOMING · Q2–Q3 2026
          </span>
        </div>
        <p className="text-[14px] leading-relaxed mb-2" style={{ color: "var(--fg)" }}>
          The decentralized liquidity engine of INFI <strong style={{ color: "var(--warning)" }}>is not live yet.</strong> Expected launch: Q2–Q3 2026. When it ships it will eliminate bridge dependency, wrapped-asset risk, and collateral barriers. Projects will borrow liquidity and earn ownership over time through real trading activity.
        </p>
      </div>

      {/* INFI Social channel tracker */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
          <div className="label-xs" style={{ color: "var(--accent-soft)" }}>
            Official INFI MultiChain channels
          </div>
          <div className="flex gap-2">
            <a
              href={INFI_X_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-md font-mono transition-colors"
              style={{
                background: "var(--bg-subtle)",
                color: "var(--fg)",
                border: "1px solid var(--border)",
                fontSize: "11px",
                letterSpacing: "0.05em",
                textDecoration: "none",
              }}
            >
              𝕏 @INFI_MultiChain ↗
            </a>
            <a
              href={INFI_LINKEDIN_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-md font-mono transition-colors"
              style={{
                background: "var(--bg-subtle)",
                color: "var(--fg)",
                border: "1px solid var(--border)",
                fontSize: "11px",
                letterSpacing: "0.05em",
                textDecoration: "none",
              }}
            >
              in LinkedIn ↗
            </a>
          </div>
        </div>

        {latest === null ? (
          <div className="text-[12px]" style={{ color: "var(--fg-dim)" }}>
            Loading latest…
          </div>
        ) : latest.length === 0 ? (
          <div className="text-[12px]" style={{ color: "var(--fg-dim)" }}>
            No recent posts. Open the channels above to follow directly.
          </div>
        ) : (
          <div className="space-y-2">
            {latest.slice(0, 2).map((p) => (
              <div
                key={p.id}
                className="p-3 rounded-lg"
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                }}
              >
                <div className="flex items-center justify-between mb-1 gap-2">
                  <span
                    className="font-mono"
                    style={{
                      fontSize: "10px",
                      color: "var(--accent-soft)",
                      letterSpacing: "0.05em",
                    }}
                  >
                    {p.platform === "x" ? "X · @INFI_MultiChain" : "LinkedIn · INFI MultiChain CDEX"}
                  </span>
                  <span className="text-[10px] font-mono" style={{ color: "var(--fg-dim)" }}>
                    {timeAgo(p.timestamp)}
                  </span>
                </div>
                <p
                  className="text-[12px] leading-relaxed"
                  style={{ color: "var(--fg-muted)" }}
                >
                  &ldquo;{p.text}&rdquo;
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Live ecosystem components */}
      <div>
        <div
          className="label-sm mb-3 flex items-center gap-2"
          style={{ color: "var(--fg-muted)" }}
        >
          <span>Live INFI ecosystem</span>
          <span style={{ color: "var(--fg-dim)" }}>/</span>
          <span style={{ color: "var(--success)" }}>active now</span>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {[
            {
              title: "INFI Launchpad",
              body: "Cross-chain fundraising with SbSe Shield protection. Zero listing fee. Community-validated launches.",
            },
            {
              title: "Accelerator Programme",
              body: "Led by Alex Nasybullin and CEO Laszlo Kellner. For founders building in DeFi, AI, RWA, DePIN.",
            },
            {
              title: "SbSe Protocol governance",
              body: "Autonomous rules engine. Trust enforced by mechanics, not promises. DAO-driven.",
            },
          ].map((card) => (
            <div
              key={card.title}
              className="card p-4"
              style={{ borderTop: "2px solid var(--success)" }}
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium" style={{ fontSize: "13px", color: "var(--fg)" }}>
                  {card.title}
                </h3>
                <span
                  className="text-[9px] font-mono px-1.5 py-0.5 rounded"
                  style={{
                    background: "var(--success-dim)",
                    color: "var(--success)",
                    letterSpacing: "0.05em",
                  }}
                >
                  LIVE
                </span>
              </div>
              <p className="text-[12px] leading-relaxed" style={{ color: "var(--fg-muted)" }}>
                {card.body}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* InvertX features at launch */}
      <div>
        <div
          className="label-sm mb-3 flex items-center gap-2"
          style={{ color: "var(--fg-muted)" }}
        >
          <span>InvertX features at launch</span>
          <span style={{ color: "var(--fg-dim)" }}>/</span>
          <span style={{ color: "var(--warning)" }}>planned · Q2–Q3 2026</span>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {[
            {
              title: "Cross-chain presales",
              body: "Will let projects raise across 14+ chains at once. No bridges. No forced asset migration.",
            },
            {
              title: "Instant cross-chain swaps",
              body: "Native token execution across chains. No wrapped asset risk. No bridge waits.",
            },
            {
              title: "Liquidity lending",
              body: "Borrow liquidity before owning it. Earn ownership through trading volume. Zero fees, zero collateral.",
            },
          ].map((card) => (
            <div
              key={card.title}
              className="card p-4"
              style={{ borderTop: "2px solid var(--warning)" }}
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium" style={{ fontSize: "13px", color: "var(--fg)" }}>
                  {card.title}
                </h3>
                <span
                  className="text-[9px] font-mono px-1.5 py-0.5 rounded"
                  style={{
                    background: "var(--warning-dim)",
                    color: "var(--warning)",
                    letterSpacing: "0.05em",
                  }}
                >
                  PLANNED
                </span>
              </div>
              <p className="text-[12px] leading-relaxed" style={{ color: "var(--fg-muted)" }}>
                {card.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
