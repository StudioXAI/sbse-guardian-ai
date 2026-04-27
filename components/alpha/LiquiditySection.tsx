"use client";

import { useEffect, useState } from "react";
import type {
  LiquidityMap,
  LiquidityProtocol,
} from "@/lib/alpha/liquidityClient";
import { alphaGet } from "@/lib/alpha/client";
import { directionFillVar } from "./DirectionBadge";
import { formatUsd } from "@/lib/alpha/format";
import OrderBookDepth from "./OrderBookDepth";
import LiquidityRadar from "./LiquidityRadar";
import TradingViewWidget from "./TradingViewWidget";

type LiqTab = "tvl" | "orderbook" | "radar" | "charts";

const TABS: Array<{ id: LiqTab; label: string; sub: string }> = [
  { id: "tvl", label: "TVL", sub: "DeFi capital flows" },
  { id: "orderbook", label: "Order book", sub: "Live depth · Bookmap" },
  { id: "radar", label: "Liquidity radar", sub: "Top 10 · radial map" },
  { id: "charts", label: "Charts", sub: "Multi-timeframe analysis" },
];

export default function LiquiditySection() {
  const [tab, setTab] = useState<LiqTab>("tvl");

  return (
    <div className="space-y-5">
      {/* Sub-tab strip */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className="px-3 py-2 rounded-md text-left transition-colors"
            style={{
              background: t.id === tab ? "var(--accent-dim)" : "var(--bg-subtle)",
              border:
                t.id === tab
                  ? "1px solid var(--border-accent)"
                  : "1px solid var(--border)",
              color: t.id === tab ? "var(--accent-soft)" : "var(--fg-muted)",
              cursor: "pointer",
            }}
          >
            <div
              className="font-mono"
              style={{ fontSize: "11px", letterSpacing: "0.06em" }}
            >
              {t.label}
            </div>
            <div className="text-[10px] mt-0.5" style={{ color: "var(--fg-dim)" }}>
              {t.sub}
            </div>
          </button>
        ))}
      </div>

      {tab === "tvl" && <TvlPanel />}
      {tab === "orderbook" && <OrderBookDepth />}
      {tab === "radar" && <LiquidityRadar />}
      {tab === "charts" && <TradingViewWidget />}

      {/* Decentralization disclaimer */}
      <div
        className="card p-3"
        style={{ background: "var(--bg-subtle)", borderColor: "var(--border)" }}
      >
        <p className="text-[11px]" style={{ color: "var(--fg-dim)" }}>
          Liquidity data aggregated from public market endpoints. Not financial
          advice. SbSe Guardian Alpha is non-custodial — no execution, no
          custody, no KYC.
        </p>
      </div>
    </div>
  );
}

/* ─── TVL panel (was DefiLlama panel, neutral-labeled now) ─── */

function TvlPanel() {
  const [map, setMap] = useState<LiquidityMap | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const data = await alphaGet<LiquidityMap>("/api/alpha/liquidity");
      if (!cancelled) setMap(data ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (map === null) {
    return (
      <div className="card p-5">
        <div className="text-sm" style={{ color: "var(--fg-dim)" }}>
          Loading TVL flows…
        </div>
      </div>
    );
  }

  if (map.topProtocols.length === 0) {
    return (
      <div
        className="card p-5"
        style={{ borderLeft: "3px solid var(--warning)" }}
      >
        <div className="label-xs mb-2" style={{ color: "var(--warning)" }}>
          TVL data unavailable
        </div>
        <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
          The DeFi capital map is temporarily unreachable. Data refreshes every
          5 minutes — check back shortly. In the meantime, the order book and
          radar tabs are live.
        </p>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="label-sm" style={{ color: "var(--fg-muted)" }}>
          DeFi capital map · top protocols
        </div>
        <span
          className="text-[10px] px-2 py-1 rounded-full font-mono"
          style={{
            background: "var(--accent-dim)",
            color: "var(--accent-soft)",
            letterSpacing: "0.05em",
          }}
        >
          {map.topProtocols.length} TRACKED
        </span>
      </div>
      <div className="space-y-2">
        {map.topProtocols.map((p: LiquidityProtocol) => {
          const flowFill = directionFillVar(
            p.change1d > 0
              ? "bullish"
              : p.change1d < 0
              ? "bearish"
              : "neutral",
          );
          return (
            <div
              key={p.name}
              className="flex items-center justify-between p-3 rounded-lg gap-3"
              style={{ background: "var(--bg-elevated)" }}
            >
              <div className="flex-1 min-w-0">
                <div
                  className="font-medium text-[13px]"
                  style={{ color: "var(--fg)" }}
                >
                  {p.name}
                </div>
                <div className="text-[11px]" style={{ color: "var(--fg-dim)" }}>
                  {p.category}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div
                  className="font-mono"
                  style={{ color: "var(--fg)", fontSize: "13px" }}
                >
                  {formatUsd(p.tvlUsd)}
                </div>
                <div
                  className="font-mono text-[11px]"
                  style={{ color: flowFill }}
                >
                  {p.change1d >= 0 ? "+" : ""}
                  {p.change1d.toFixed(2)}% · 24h
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
