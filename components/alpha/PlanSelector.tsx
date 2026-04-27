"use client";

import { useState } from "react";

interface PlanFeature {
  monthlyUsd: number;
  annualUsd: number;
  features: string[];
}

const TRADER: PlanFeature = {
  monthlyUsd: 29,
  annualUsd: 278,
  features: [
    "Real-time signal feed (live, no delay)",
    "AI predictions with multi-timeframe BTC",
    "Whale tracker — 5 exchange wallets",
    "Polymarket consensus signals",
    "DefiLlama liquidity map",
    "Coinglass liquidations + funding rates",
    "Real-time order book depth",
    "TradingView embedded charts",
    "INFI ecosystem tracking",
    "5 Telegram alerts per day",
  ],
};

const PRO: PlanFeature = {
  monthlyUsd: 79,
  annualUsd: 758,
  features: [
    "Everything in Trader",
    "Custom whale wallets — track up to 25",
    "API access — 10,000 calls per day",
    "Slack & Email integrations",
    "Competitor tracking dashboard",
    "Priority support (24h response)",
    "Up to 3 team seats",
  ],
};

const FREE_FEATURES: string[] = [
  "3 most-recent signals (1-hour delay)",
  "AI prediction summary (no per-asset cards)",
  "INFI ecosystem tracking",
  "Social channel links",
  "Read-only Overview",
];

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (tier: "trader" | "pro", billing: "monthly" | "annual") => void;
}

export default function PlanSelector({ open, onClose, onSelect }: Props) {
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{
        background: "rgba(7,8,10,0.85)",
        backdropFilter: "blur(8px)",
      }}
      onClick={onClose}
    >
      <div
        className="card max-w-4xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        style={{ padding: "32px" }}
      >
        <div className="flex items-start justify-between mb-6 gap-4">
          <div>
            <div className="label-xs mb-2" style={{ color: "var(--accent-soft)" }}>
              Choose your plan
            </div>
            <h2
              className="font-medium tracking-tight"
              style={{
                fontSize: "24px",
                color: "var(--fg)",
                letterSpacing: "-0.02em",
              }}
            >
              Pay once. <span className="text-gradient-accent">Unlock 30 days.</span>
            </h2>
            <p className="text-[13px] mt-2" style={{ color: "var(--fg-muted)" }}>
              USDC or USDT on Ethereum, BSC, Polygon, Base, Arbitrum, or Optimism.
              No card. No subscription lock-in.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-[20px] px-2"
            style={{
              color: "var(--fg-dim)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>

        {/* Billing toggle */}
        <div
          className="inline-flex p-1 rounded-md mb-5"
          style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}
        >
          {(["monthly", "annual"] as const).map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setBilling(b)}
              className="px-3 py-1.5 rounded font-mono transition-colors"
              style={{
                background: billing === b ? "var(--accent)" : "transparent",
                color: billing === b ? "#fff" : "var(--fg-muted)",
                fontSize: "11px",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                border: "none",
                cursor: "pointer",
              }}
            >
              {b}
              {b === "annual" && (
                <span
                  className="ml-2"
                  style={{
                    color: billing === "annual" ? "rgba(255,255,255,0.7)" : "var(--success)",
                  }}
                >
                  −20%
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Plan cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <FreeCard />
          <PaidCard
            label="Trader"
            tagline="For active retail traders"
            data={TRADER}
            billing={billing}
            onSelect={() => onSelect("trader", billing)}
          />
          <PaidCard
            label="Pro"
            tagline="For professionals & teams"
            data={PRO}
            billing={billing}
            onSelect={() => onSelect("pro", billing)}
            highlighted
          />
        </div>

        <p
          className="text-[11px] mt-6 text-center"
          style={{ color: "var(--fg-dim)" }}
        >
          All payments verified on-chain. No refunds. Plans expire after 30 days
          — re-pay to continue. Predictions are signals, not financial advice.
          Always DYOR.
        </p>
      </div>
    </div>
  );
}

function FreeCard() {
  return (
    <div
      className="rounded-xl p-5"
      style={{
        background: "var(--bg-subtle)",
        border: "1px solid var(--border)",
      }}
    >
      <div className="font-medium mb-1" style={{ fontSize: "18px", color: "var(--fg)" }}>
        Free
      </div>
      <div className="text-[12px] mb-4" style={{ color: "var(--fg-muted)" }}>
        Limited preview · no payment
      </div>

      <div className="flex items-baseline gap-1 mb-5">
        <span
          className="font-medium"
          style={{
            fontSize: "32px",
            color: "var(--fg)",
            fontFamily: "var(--font-mono)",
            letterSpacing: "-0.02em",
          }}
        >
          $0
        </span>
        <span className="text-[13px]" style={{ color: "var(--fg-dim)" }}>
          forever
        </span>
      </div>

      <ul className="space-y-2 mb-5">
        {FREE_FEATURES.map((f) => (
          <li
            key={f}
            className="text-[12px] flex items-start gap-2"
            style={{ color: "var(--fg)" }}
          >
            <span style={{ color: "var(--fg-dim)", flexShrink: 0 }}>·</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <div
        className="w-full px-4 py-2.5 rounded-md text-center"
        style={{
          background: "transparent",
          color: "var(--fg-muted)",
          border: "1px solid var(--border)",
          fontSize: "13px",
          fontWeight: 500,
        }}
      >
        Active by default
      </div>
    </div>
  );
}

interface PaidCardProps {
  label: string;
  tagline: string;
  data: PlanFeature;
  billing: "monthly" | "annual";
  onSelect: () => void;
  highlighted?: boolean;
}

function PaidCard({ label, tagline, data, billing, onSelect, highlighted }: PaidCardProps) {
  const price = billing === "annual" ? data.annualUsd : data.monthlyUsd;
  const sub = billing === "annual" ? "/year" : "/month";

  return (
    <div
      className="rounded-xl p-5"
      style={{
        background: "var(--bg-elevated)",
        border: highlighted
          ? "1px solid var(--accent)"
          : "1px solid var(--border)",
        boxShadow: highlighted ? "0 0 24px rgba(108,99,255,0.15)" : "none",
      }}
    >
      {highlighted && (
        <div
          className="text-[10px] px-2 py-1 rounded-full font-mono inline-block mb-3"
          style={{
            background: "var(--accent-dim)",
            color: "var(--accent-soft)",
            letterSpacing: "0.05em",
          }}
        >
          MOST POPULAR
        </div>
      )}

      <div className="font-medium mb-1" style={{ fontSize: "18px", color: "var(--fg)" }}>
        {label}
      </div>
      <div className="text-[12px] mb-4" style={{ color: "var(--fg-muted)" }}>
        {tagline}
      </div>

      <div className="flex items-baseline gap-1 mb-5">
        <span
          className="font-medium"
          style={{
            fontSize: "32px",
            color: "var(--fg)",
            fontFamily: "var(--font-mono)",
            letterSpacing: "-0.02em",
          }}
        >
          ${price}
        </span>
        <span className="text-[13px]" style={{ color: "var(--fg-dim)" }}>
          {sub}
        </span>
      </div>

      <ul className="space-y-2 mb-5">
        {data.features.map((f) => (
          <li
            key={f}
            className="text-[12px] flex items-start gap-2"
            style={{ color: "var(--fg)" }}
          >
            <span style={{ color: "var(--success)", flexShrink: 0 }}>✓</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onSelect}
        className="w-full px-4 py-2.5 rounded-md transition-colors"
        style={{
          background: highlighted ? "var(--accent)" : "transparent",
          color: highlighted ? "#fff" : "var(--fg)",
          border: highlighted ? "none" : "1px solid var(--border-strong)",
          fontSize: "13px",
          fontWeight: 500,
          cursor: "pointer",
        }}
      >
        Choose {label}
      </button>
    </div>
  );
}
