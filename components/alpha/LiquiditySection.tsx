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
import CoinglassPanel from "./CoinglassPanel";
import TradingViewWidget from "./TradingViewWidget";

type LiqTab = "defillama" | "orderbook" | "coinglass" | "tradingview";

const TABS: Array<{ id: LiqTab; label: string; sub: string }> = [
  { id: "defillama", label: "DefiLlama", sub: "TVL · DeFi flows" },
  { id: "orderbook", label: "Order Book", sub: "Bookmap-style · Binance" },
  { id: "coinglass", label: "Coinglass", sub: "Liquidations · OI · Funding" },
  { id: "tradingview", label: "TradingView", sub: "Charts · LuxAlgo scripts" },
];

export default function LiquiditySection() {
  const [tab, setTab] = useState<LiqTab>("defillama");

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
              background:
                t.id === tab ? "var(--accent-dim)" : "var(--bg-subtle)",
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

      {tab === "defillama" && <DefiLlamaPanel />}
      {tab === "orderbook" && <OrderBookDepth />}
      {tab === "coinglass" && <CoinglassPanel />}
      {tab === "tradingview" && <TradingViewWidget />}
    </div>
  );
}

function DefiLlamaPanel() {
  const [map, setMap] = useState<LiquidityMap | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const data = await alphaGet<LiquidityMap>("/api/alpha/liquidity");
      if (cancelled) return;
      if (!data) setError("Couldn't reach DefiLlama. Try again in a moment.");
      else setMap(data);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="card p-5" style={{ borderLeft: "3px solid var(--danger)" }}>
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      </div>
    );
  }

  if (!map) {
    return (
      <div className="card p-5">
        <p className="text-sm" style={{ color: "var(--fg-dim)" }}>
          Loading liquidity map from DefiLlama…
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div
        className="card p-4 flex items-center justify-between flex-wrap gap-2"
        style={{ borderLeft: "3px solid var(--accent)" }}
      >
        <div>
          <div className="label-xs" style={{ color: "var(--accent-soft)" }}>
            DefiLlama · DeFi liquidity map
          </div>
          <div className="text-[12px] mt-1" style={{ color: "var(--fg-muted)" }}>
            Total tracked TVL:{" "}
            <span className="font-mono" style={{ color: "var(--fg)" }}>
              {formatUsd(map.totalTvlUsd)}
            </span>
          </div>
        </div>
        <a
          href="https://defillama.com"
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
          defillama.com ↗
        </a>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="label-sm" style={{ color: "var(--fg-muted)" }}>
              Top inflows · 24h
            </div>
            <span
              className="text-[10px] px-2 py-1 rounded-full font-mono"
              style={{
                background: "var(--success-dim)",
                color: "var(--success)",
                letterSpacing: "0.05em",
              }}
            >
              CAPITAL IN
            </span>
          </div>
          {map.topInflows.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--fg-dim)" }}>
              No major positive flows in the last 24h.
            </p>
          ) : (
            <div className="space-y-2">
              {map.topInflows.map((p) => (
                <ProtocolRow key={p.name} protocol={p} />
              ))}
            </div>
          )}
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="label-sm" style={{ color: "var(--fg-muted)" }}>
              Top outflows · 24h
            </div>
            <span
              className="text-[10px] px-2 py-1 rounded-full font-mono"
              style={{
                background: "var(--danger-dim)",
                color: "var(--danger)",
                letterSpacing: "0.05em",
              }}
            >
              CAPITAL OUT
            </span>
          </div>
          {map.topOutflows.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--fg-dim)" }}>
              No major negative flows in the last 24h.
            </p>
          ) : (
            <div className="space-y-2">
              {map.topOutflows.map((p) => (
                <ProtocolRow key={p.name} protocol={p} />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card p-5">
        <div className="label-sm mb-3" style={{ color: "var(--fg-muted)" }}>
          Top protocols by TVL
        </div>
        <div className="space-y-2">
          {map.topProtocols.map((p) => (
            <ProtocolRow key={p.name} protocol={p} showTvlBar />
          ))}
        </div>
      </div>

      <div className="card p-5">
        <div className="label-sm mb-3" style={{ color: "var(--fg-muted)" }}>
          Chain liquidity distribution
        </div>
        <div className="space-y-2">
          {map.chains.map((c) => {
            const dirColor =
              c.change1d > 1
                ? "var(--success)"
                : c.change1d < -1
                ? "var(--danger)"
                : "var(--fg-muted)";
            return (
              <div
                key={c.name}
                className="p-3 rounded-lg flex items-center gap-3"
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className="font-medium text-[13px]"
                      style={{ color: "var(--fg)" }}
                    >
                      {c.name}
                    </span>
                    <span className="font-mono text-[11px]" style={{ color: dirColor }}>
                      {c.change1d >= 0 ? "+" : ""}
                      {c.change1d.toFixed(2)}%
                    </span>
                  </div>
                  <div
                    className="h-[3px] rounded-full"
                    style={{ background: "var(--border)" }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, c.sharePct * 2)}%`,
                        background: "var(--accent)",
                      }}
                    />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-[10px]" style={{ color: "var(--fg-dim)" }}>
                      {c.sharePct.toFixed(1)}% of tracked TVL
                    </span>
                    <span
                      className="text-[10px] font-mono"
                      style={{ color: "var(--fg-dim)" }}
                    >
                      {formatUsd(c.tvlUsd)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface ProtocolRowProps {
  protocol: LiquidityProtocol;
  showTvlBar?: boolean;
}

function ProtocolRow({ protocol: p, showTvlBar }: ProtocolRowProps) {
  const fill = directionFillVar(p.direction);
  const borderColor =
    p.direction === "bullish"
      ? "var(--success)"
      : p.direction === "bearish"
      ? "var(--danger)"
      : "var(--accent)";

  return (
    <div
      className="p-3 rounded-lg"
      style={{
        background: "var(--bg-elevated)",
        borderLeft: `3px solid ${borderColor}`,
      }}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span
            className="font-medium text-[13px] truncate"
            style={{ color: "var(--fg)" }}
          >
            {p.name}
          </span>
          <span
            className="text-[10px] font-mono px-1.5 py-0.5 rounded flex-shrink-0"
            style={{
              background: "var(--bg-subtle)",
              color: "var(--fg-dim)",
              letterSpacing: "0.04em",
            }}
          >
            {p.category}
          </span>
        </div>
        <span
          className="font-mono text-[12px] flex-shrink-0"
          style={{ color: fill }}
        >
          {p.change1d >= 0 ? "+" : ""}
          {p.change1d.toFixed(2)}%
        </span>
      </div>
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-mono" style={{ color: "var(--fg-muted)" }}>
          TVL {formatUsd(p.tvlUsd)}
        </span>
        <span style={{ color: "var(--fg-dim)" }}>
          {p.chains.slice(0, 3).join(" · ")}
          {p.chains.length > 3 ? ` +${p.chains.length - 3}` : ""}
        </span>
      </div>
      {showTvlBar && (
        <div
          className="h-[2px] rounded-full mt-2"
          style={{ background: "var(--border)" }}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.min(100, p.score)}%`,
              background: fill,
            }}
          />
        </div>
      )}
    </div>
  );
}
