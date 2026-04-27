"use client";

import { useEffect, useState } from "react";
import type {
  OverviewStats,
  Signal,
  PredictionResponse,
} from "@/lib/alpha/types";
import { alphaGet } from "@/lib/alpha/client";
import SignalRow from "./SignalRow";
import PredictionCard from "./PredictionCard";
import type { AlphaSection } from "./AlphaSubNav";

interface Props {
  freeMode?: boolean;
  onNavigate: (section: AlphaSection) => void;
  onUpgrade?: () => void;
}

const STAT_DEFS: Array<{
  label: string;
  key: keyof OverviewStats;
  format?: (n: number) => string;
  sub?: string;
  paidOnly?: boolean;
}> = [
  { label: "Signals", key: "signalsActive", sub: "active" },
  { label: "Threats", key: "threatsBlocked24h", sub: "Last 24h", paidOnly: true },
  {
    label: "Wallets",
    key: "walletsMonitored",
    format: (n) => n.toLocaleString(),
    sub: "Monitored",
    paidOnly: true,
  },
  { label: "Whales", key: "whalesToday", sub: "Today", paidOnly: true },
  {
    label: "Health",
    key: "ecosystemHealthPct",
    format: (n) => `${n.toFixed(1)}%`,
    sub: "Nominal",
  },
];

export default function OverviewSection({
  freeMode = false,
  onNavigate,
  onUpgrade,
}: Props) {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [topSignals, setTopSignals] = useState<Signal[] | null>(null);
  const [prediction, setPrediction] = useState<PredictionResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [overview, signals, predict] = await Promise.all([
        alphaGet<OverviewStats>("/api/alpha/overview"),
        alphaGet<Signal[]>("/api/alpha/signals?filter=market"),
        alphaGet<PredictionResponse>("/api/alpha/predict"),
      ]);
      if (cancelled) return;
      if (overview) setStats(overview);
      if (signals) {
        if (freeMode) {
          const cutoff = Date.now() - 60 * 60 * 1000;
          setTopSignals(signals.filter((s) => s.timestamp <= cutoff).slice(0, 3));
        } else {
          setTopSignals(signals.slice(0, 5));
        }
      }
      if (predict) setPrediction(predict);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [freeMode]);

  return (
    <div className="space-y-6">
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}
      >
        {STAT_DEFS.map((def) => {
          const isLocked = freeMode && def.paidOnly;
          const value = stats ? stats[def.key] : null;
          const display = isLocked
            ? "—"
            : value === null
            ? "—"
            : def.format
            ? def.format(value as number)
            : String(value);
          return (
            <div
              key={def.label}
              className="card p-4"
              style={{ opacity: isLocked ? 0.5 : 1 }}
            >
              <div className="label-xs flex items-center gap-1.5" style={{ color: "var(--fg-dim)" }}>
                {def.label}
                {isLocked && (
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    aria-hidden
                  >
                    <rect width="18" height="11" x="3" y="11" rx="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                )}
              </div>
              <div
                className="font-medium mt-1.5"
                style={{
                  fontSize: "22px",
                  color: "var(--fg)",
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "-0.01em",
                }}
              >
                {display}
              </div>
              {def.sub && (
                <div className="text-[11px] mt-1" style={{ color: "var(--fg-dim)" }}>
                  {isLocked ? "Upgrade" : def.sub}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {prediction && (
        <div className="card p-5" style={{ borderLeft: "3px solid var(--accent)" }}>
          <div
            className="label-xs mb-3 flex items-center gap-2"
            style={{ color: "var(--accent-soft)" }}
          >
            <span>AI Market Summary · 1–2H Forecast</span>
          </div>
          <p className="text-[14px] leading-relaxed" style={{ color: "var(--fg)" }}>
            {prediction.summary}
          </p>
          {!freeMode && (
            <div
              className="grid gap-2 mt-4"
              style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}
            >
              {prediction.shortHorizon.slice(0, 4).map((p) => (
                <PredictionCard key={p.asset} prediction={p} />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card p-5">
          <div
            className="flex items-center justify-between mb-3 label-xs"
            style={{ color: "var(--fg-dim)" }}
          >
            <span>Top signals{freeMode ? " · 1h delayed" : ""}</span>
            <button
              type="button"
              onClick={() => onNavigate("signals")}
              className="hover:brightness-125"
              style={{
                color: "var(--accent-soft)",
                textTransform: "none",
                letterSpacing: 0,
                fontSize: "12px",
                fontFamily: "var(--font-sans)",
                background: "transparent",
                border: "none",
                cursor: "pointer",
              }}
            >
              View all →
            </button>
          </div>
          {topSignals === null ? (
            <div className="text-sm" style={{ color: "var(--fg-dim)" }}>
              Loading signals…
            </div>
          ) : topSignals.length === 0 ? (
            <div className="text-sm" style={{ color: "var(--fg-dim)" }}>
              No active signals.
            </div>
          ) : (
            topSignals.map((s) => <SignalRow key={s.id} signal={s} />)
          )}
        </div>

        <div className="card p-5">
          <div className="label-xs mb-3" style={{ color: "var(--fg-dim)" }}>
            Quick actions
          </div>
          <div className="space-y-2">
            {(
              [
                { id: "signals", label: "Browse signals", desc: freeMode ? "3 most-recent, 1h delayed" : "Live market + INFI feed", paidOnly: false },
                { id: "predictions", label: "AI predictions", desc: freeMode ? "Summary only" : "Multi-asset forecast", paidOnly: false },
                { id: "liquidity", label: "Liquidity map", desc: "DefiLlama, order book, Coinglass", paidOnly: true },
                { id: "whales", label: "Whale tracker", desc: "$1M+ on-chain movements", paidOnly: true },
                { id: "polymarket", label: "Polymarket bets", desc: "Real-money consensus", paidOnly: true },
                { id: "infi", label: "INFI ecosystem", desc: "Status, channels, alerts", paidOnly: false },
                { id: "social", label: "Social intel", desc: "X + LinkedIn", paidOnly: false },
              ] as const
            ).map((a) => {
              const locked = freeMode && a.paidOnly;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    if (locked && onUpgrade) {
                      onUpgrade();
                    } else {
                      onNavigate(a.id);
                    }
                  }}
                  className="w-full text-left p-3 rounded-lg flex items-center justify-between transition-colors"
                  style={{
                    background: "var(--bg-subtle)",
                    border: "1px solid var(--border)",
                    color: "var(--fg)",
                    opacity: locked ? 0.65 : 1,
                  }}
                >
                  <span>
                    <span className="block text-[13px] flex items-center gap-1.5">
                      {a.label}
                      {locked && (
                        <svg
                          width="11"
                          height="11"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          aria-hidden
                        >
                          <rect width="18" height="11" x="3" y="11" rx="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                      )}
                    </span>
                    <span
                      className="block text-[11px] mt-0.5"
                      style={{ color: "var(--fg-dim)" }}
                    >
                      {locked ? "Upgrade to unlock" : a.desc}
                    </span>
                  </span>
                  <span style={{ color: "var(--accent-soft)" }}>→</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
