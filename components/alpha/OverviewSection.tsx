"use client";

import { useCallback, useEffect } from "react";
import type {
  OverviewStats,
  Signal,
  PredictionResponse,
} from "@/lib/alpha/types";
import { alphaGet } from "@/lib/alpha/client";
import { useAutoRefresh } from "@/lib/alpha/useAutoRefresh";
import { useRefreshContext } from "@/lib/alpha/refreshContext";
import SignalRow from "./SignalRow";
import PredictionCard from "./PredictionCard";
import type { AlphaSection } from "./AlphaSubNav";

const REFRESH_MS = 90_000;

interface OverviewBundle {
  stats: OverviewStats | null;
  topSignals: Signal[];
  prediction: PredictionResponse | null;
}

interface Props {
  onNavigate: (section: AlphaSection) => void;
}

const STAT_DEFS: Array<{
  label: string;
  key: keyof OverviewStats;
  format?: (n: number) => string;
  sub?: string;
}> = [
  { label: "Signals", key: "signalsActive", sub: "active" },
  { label: "Threats", key: "threatsBlocked24h", sub: "Last 24h" },
  {
    label: "Wallets",
    key: "walletsMonitored",
    format: (n) => n.toLocaleString(),
    sub: "Monitored",
  },
  { label: "Whales", key: "whalesToday", sub: "Today" },
  {
    label: "Health",
    key: "ecosystemHealthPct",
    format: (n) => `${n.toFixed(1)}%`,
    sub: "Nominal",
  },
];

export default function OverviewSection({ onNavigate }: Props) {
  const { reportRefresh } = useRefreshContext();

  const loader = useCallback(async (): Promise<OverviewBundle | null> => {
    const [overview, signals, predict] = await Promise.all([
      alphaGet<OverviewStats>("/api/alpha/overview"),
      alphaGet<Signal[]>("/api/alpha/signals?filter=market"),
      alphaGet<PredictionResponse>("/api/alpha/predict"),
    ]);
    if (!overview && !signals && !predict) return null;
    return {
      stats: overview ?? null,
      topSignals: signals ? signals.slice(0, 5) : [],
      prediction: predict ?? null,
    };
  }, []);

  const { data, lastRefreshedAt } = useAutoRefresh<OverviewBundle>(
    loader,
    REFRESH_MS,
  );

  useEffect(() => {
    if (lastRefreshedAt !== null) reportRefresh();
  }, [lastRefreshedAt, reportRefresh]);

  const stats = data?.stats ?? null;
  const topSignals = data?.topSignals ?? null;
  const prediction = data?.prediction ?? null;

  return (
    <div className="space-y-6">
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}
      >
        {STAT_DEFS.map((def) => {
          const value = stats ? stats[def.key] : null;
          const display =
            value === null
              ? "—"
              : def.format
              ? def.format(value as number)
              : String(value);
          return (
            <div key={def.label} className="card p-4">
              <div className="label-xs" style={{ color: "var(--fg-dim)" }}>
                {def.label}
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
                  {def.sub}
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
          <div
            className="grid gap-2 mt-4"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}
          >
            {prediction.shortHorizon.slice(0, 4).map((p) => (
              <PredictionCard key={p.asset} prediction={p} />
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card p-5">
          <div
            className="flex items-center justify-between mb-3 label-xs"
            style={{ color: "var(--fg-dim)" }}
          >
            <span>Top signals</span>
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
                { id: "signals", label: "Browse signals", desc: "Live market + INFI feed" },
                { id: "predictions", label: "AI predictions", desc: "Multi-asset forecast" },
                { id: "liquidity", label: "Liquidity map", desc: "TVL, order book, heatmap" },
                { id: "whales", label: "Whale tracker", desc: "$100K+ on-chain movements" },
                { id: "threats", label: "Threat scanner", desc: "Suspicious sells & risk events" },
                { id: "polymarket", label: "Polymarket bets", desc: "Real-money consensus" },
                { id: "infi", label: "INFI ecosystem", desc: "Status, channels, alerts" },
                { id: "social", label: "Social intel", desc: "Aggregated sentiment" },
              ] as const
            ).map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => onNavigate(a.id)}
                className="w-full text-left p-3 rounded-lg flex items-center justify-between transition-colors"
                style={{
                  background: "var(--bg-subtle)",
                  border: "1px solid var(--border)",
                  color: "var(--fg)",
                }}
              >
                <span>
                  <span className="block text-[13px]">{a.label}</span>
                  <span
                    className="block text-[11px] mt-0.5"
                    style={{ color: "var(--fg-dim)" }}
                  >
                    {a.desc}
                  </span>
                </span>
                <span style={{ color: "var(--accent-soft)" }}>→</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
