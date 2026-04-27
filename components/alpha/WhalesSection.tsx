"use client";

import { useEffect, useState } from "react";
import type { WhaleMove } from "@/lib/alpha/types";
import { alphaGet } from "@/lib/alpha/client";
import { directionFillVar } from "./DirectionBadge";
import { timeAgo, formatUsd } from "@/lib/alpha/format";

const TRACKED_WALLETS = [
  { addr: "0x28C6c06298d514Db089934071355E5743bf21d60", label: "Binance hot" },
  { addr: "0x21a31Ee1afC51d94C2eFcCAa2092aD1028285549", label: "Binance cold" },
  { addr: "0x71660c4005ba85c37ccec55d0c4493e66fe775d3", label: "Coinbase Prime" },
  { addr: "0x2910543af39aba0cd09dbb2d50200b3e800a63d2", label: "Kraken" },
  { addr: "0x77696bb39917C91A0c3908D577d5e322095425cA", label: "Bitfinex" },
];

export default function WhalesSection() {
  const [whales, setWhales] = useState<WhaleMove[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const data = await alphaGet<WhaleMove[]>("/api/alpha/whales");
      if (!cancelled) setWhales(data ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-5">
      {/* Live whale movements card */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="label-sm" style={{ color: "var(--fg-muted)" }}>
            Live whale movements · on-chain
          </div>
          <span
            className="text-[10px] px-2 py-1 rounded-full font-mono"
            style={{
              background: "var(--danger-dim)",
              color: "var(--danger)",
              letterSpacing: "0.05em",
            }}
          >
            $1M+ ONLY · USDT · USDC · WETH · WBTC
          </span>
        </div>

        {whales === null && (
          <div className="text-sm" style={{ color: "var(--fg-dim)" }}>
            Loading whale feed…
          </div>
        )}

        {whales && whales.length === 0 && (
          <div
            className="p-4 rounded-lg"
            style={{ background: "var(--bg-elevated)" }}
          >
            <div
              className="font-mono text-[11px] mb-2"
              style={{ color: "var(--fg-dim)", letterSpacing: "0.05em" }}
            >
              NO MOVEMENTS · LAST FEW HOURS
            </div>
            <p className="text-[13px]" style={{ color: "var(--fg-muted)" }}>
              No $1M+ stablecoin or major-asset transfers on the tracked
              exchange wallets recently. Check the deep-analysis services
              below for broader on-chain flow context.
            </p>
          </div>
        )}

        {whales && whales.length > 0 && (
          <div className="space-y-2">
            {whales.map((w) => {
              const fill = directionFillVar(w.direction);
              const borderColor =
                w.direction === "bullish"
                  ? "var(--success)"
                  : w.direction === "bearish"
                  ? "var(--danger)"
                  : "var(--accent)";
              const sign =
                w.direction === "bearish"
                  ? "−"
                  : w.direction === "bullish"
                  ? "+"
                  : "";
              return (
                <div
                  key={w.id}
                  className="flex items-center justify-between p-3 rounded-lg gap-3"
                  style={{
                    background: "var(--bg-elevated)",
                    borderLeft: `3px solid ${borderColor}`,
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <div
                      className="font-mono text-[12px] truncate"
                      style={{ color: "var(--info)" }}
                    >
                      {w.address}
                    </div>
                    <div
                      className="text-[12px] mt-0.5"
                      style={{ color: "var(--fg-muted)" }}
                    >
                      {w.action} ·{" "}
                      <span className="font-mono">{timeAgo(w.timestamp)}</span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div
                      className="font-mono font-medium"
                      style={{ fontSize: "14px", color: fill }}
                    >
                      {sign}
                      {formatUsd(w.amountUsd)}
                    </div>
                    <div className="text-[11px]" style={{ color: "var(--fg-dim)" }}>
                      {w.asset}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Whale Alert immediate notifications */}
      <ServiceCard
        label="Whale Alert · immediate notifications"
        tagline="Real-time large transfer alerts across BTC, ETH, stablecoins, and 30+ other chains."
        primaryUrl="https://x.com/whale_alert"
        primaryLabel="𝕏 @whale_alert"
        secondaryUrl="https://whale-alert.io"
        secondaryLabel="whale-alert.io"
        accent="var(--accent)"
      />

      {/* Deep analysis services */}
      <div>
        <div className="label-sm mb-3" style={{ color: "var(--fg-muted)" }}>
          Deep analysis · external services
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <ServiceCard
            compact
            label="Arkham Intelligence"
            tagline="Whale entity tags, deanonymized wallets, deep on-chain analysis."
            primaryUrl="https://platform.arkhamintelligence.com"
            primaryLabel="arkhamintelligence.com ↗"
          />
          <ServiceCard
            compact
            label="DeBank · smart money"
            tagline="DeFi portfolio tracking, smart money flows, top wallet activity across protocols."
            primaryUrl="https://debank.com"
            primaryLabel="debank.com ↗"
          />
          <ServiceCard
            compact
            label="DexCheck · DEX trading"
            tagline="DEX trades, smart money signals, copy-trading insights, token analytics."
            primaryUrl="https://dexcheck.ai"
            primaryLabel="dexcheck.ai ↗"
          />
        </div>
      </div>

      {/* Tracked wallet quick-links */}
      <div className="card p-5">
        <div className="label-sm mb-3" style={{ color: "var(--fg-muted)" }}>
          Tracked exchange wallets · jump to deep analysis
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {TRACKED_WALLETS.map((w) => (
            <div
              key={w.addr}
              className="p-3 rounded-lg flex items-center justify-between gap-3"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
              }}
            >
              <div className="min-w-0">
                <div
                  className="font-medium text-[12px]"
                  style={{ color: "var(--fg)" }}
                >
                  {w.label}
                </div>
                <div
                  className="font-mono text-[10px] truncate"
                  style={{ color: "var(--fg-dim)" }}
                >
                  {w.addr.slice(0, 10)}…{w.addr.slice(-6)}
                </div>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <a
                  href={`https://etherscan.io/address/${w.addr}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2 py-1 rounded font-mono"
                  style={{
                    background: "var(--bg-subtle)",
                    color: "var(--fg-muted)",
                    border: "1px solid var(--border)",
                    fontSize: "10px",
                    letterSpacing: "0.05em",
                    textDecoration: "none",
                  }}
                >
                  etherscan
                </a>
                <a
                  href={`https://debank.com/profile/${w.addr}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2 py-1 rounded font-mono"
                  style={{
                    background: "var(--bg-subtle)",
                    color: "var(--fg-muted)",
                    border: "1px solid var(--border)",
                    fontSize: "10px",
                    letterSpacing: "0.05em",
                    textDecoration: "none",
                  }}
                >
                  debank
                </a>
                <a
                  href={`https://platform.arkhamintelligence.com/explorer/address/${w.addr}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2 py-1 rounded font-mono"
                  style={{
                    background: "var(--bg-subtle)",
                    color: "var(--fg-muted)",
                    border: "1px solid var(--border)",
                    fontSize: "10px",
                    letterSpacing: "0.05em",
                    textDecoration: "none",
                  }}
                >
                  arkham
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ServiceCard({
  label,
  tagline,
  primaryUrl,
  primaryLabel,
  secondaryUrl,
  secondaryLabel,
  accent = "var(--accent)",
  compact = false,
}: {
  label: string;
  tagline: string;
  primaryUrl: string;
  primaryLabel: string;
  secondaryUrl?: string;
  secondaryLabel?: string;
  accent?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`card ${compact ? "p-4" : "p-5"}`}
      style={{ borderLeft: `3px solid ${accent}` }}
    >
      <div className="label-xs mb-1" style={{ color: accent }}>
        {label}
      </div>
      <p
        className="text-[12px] mb-3 leading-relaxed"
        style={{ color: "var(--fg-muted)" }}
      >
        {tagline}
      </p>
      <div className="flex flex-wrap gap-2">
        <a
          href={primaryUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-1.5 rounded-md font-mono"
          style={{
            background: "var(--bg-subtle)",
            color: "var(--fg)",
            border: "1px solid var(--border)",
            fontSize: "11px",
            letterSpacing: "0.05em",
            textDecoration: "none",
          }}
        >
          {primaryLabel}
        </a>
        {secondaryUrl && secondaryLabel && (
          <a
            href={secondaryUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-md font-mono"
            style={{
              background: "var(--bg-subtle)",
              color: "var(--fg-muted)",
              border: "1px solid var(--border)",
              fontSize: "11px",
              letterSpacing: "0.05em",
              textDecoration: "none",
            }}
          >
            {secondaryLabel}
          </a>
        )}
      </div>
    </div>
  );
}
