"use client";

import { useCallback, useEffect, useState } from "react";
import type { PredictionResponse } from "@/lib/alpha/types";
import { alphaGet } from "@/lib/alpha/client";
import PredictionCard from "./PredictionCard";
import MarketTable from "./MarketTable";
import AltSeasonGauge from "./AltSeasonGauge";
import type { CryptoRow, StockRow } from "@/lib/alpha/topMarketsClient";

interface MarketsResp {
  crypto: CryptoRow[];
  stocks: StockRow[];
  generatedAt: number;
}

interface Props {
  freeMode?: boolean;
  onUpgrade?: () => void;
}

export default function PredictionsSection({ freeMode = false, onUpgrade }: Props) {
  const [data, setData] = useState<PredictionResponse | null>(null);
  const [markets, setMarkets] = useState<MarketsResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"ai" | "crypto" | "stocks">("ai");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [pred, mkt] = await Promise.all([
      alphaGet<PredictionResponse>("/api/alpha/predict"),
      alphaGet<MarketsResp>("/api/alpha/markets"),
    ]);
    if (!pred) setError("Couldn't reach the prediction engine.");
    else setData(pred);
    if (mkt) setMarkets(mkt);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-5">
      {freeMode && (
        <div
          className="card p-3 flex items-center justify-between gap-3 flex-wrap"
          style={{ borderLeft: "3px solid var(--accent)" }}
        >
          <div className="text-[12px]" style={{ color: "var(--fg-muted)" }}>
            <span style={{ color: "var(--accent-soft)" }}>Free preview</span> ·
            AI summary only. Upgrade for multi-asset cards, multi-timeframe
            BTC, and full Top 50 crypto/stock tables.
          </div>
          {onUpgrade && (
            <button
              type="button"
              onClick={onUpgrade}
              className="px-3 py-1 rounded-md transition-colors"
              style={{
                background: "var(--accent-dim)",
                color: "var(--accent-soft)",
                fontSize: "11px",
                fontWeight: 500,
                border: "1px solid var(--border-accent)",
                cursor: "pointer",
              }}
            >
              Upgrade
            </button>
          )}
        </div>
      )}

      {/* Sub-tabs for predictions, top crypto, top stocks. Free users only see AI. */}
      {!freeMode && (
        <div className="flex flex-wrap gap-2">
          {(
            [
              { id: "ai", label: "AI Predictions", sub: "Multi-asset · Multi-timeframe" },
              { id: "crypto", label: "Top 50 Crypto", sub: "By market cap · CoinGecko" },
              { id: "stocks", label: "Top 50 Stocks", sub: "US large-cap · Yahoo Finance" },
            ] as const
          ).map((t) => (
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
      )}

      {/* AI Predictions tab */}
      {(freeMode || tab === "ai") && (
        <>
          {/* Alt Season Index — paid users only, full feature. */}
          {!freeMode && <AltSeasonGauge />}

          <div
            className="card p-5"
            style={{ borderLeft: "3px solid var(--accent)" }}
          >
            <div
              className="label-xs mb-3 flex items-center justify-between"
              style={{ color: "var(--accent-soft)" }}
            >
              <span>AI Market Summary · 1–2H Forecast</span>
              <button
                type="button"
                onClick={load}
                disabled={loading}
                className="text-xs px-3 py-1 rounded-md transition-colors disabled:opacity-50"
                style={{
                  border: "1px solid var(--border-strong)",
                  color: "var(--fg)",
                  background: "transparent",
                  textTransform: "none",
                  letterSpacing: 0,
                  fontFamily: "var(--font-sans)",
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                {loading ? "Refreshing…" : "Refresh"}
              </button>
            </div>

            {error && (
              <p className="text-sm" style={{ color: "var(--danger)" }}>
                {error}
              </p>
            )}

            {data && (
              <p className="text-[14px] leading-relaxed" style={{ color: "var(--fg)" }}>
                {data.summary}
              </p>
            )}
          </div>

          {!freeMode && data && data.shortHorizon.length > 0 && (
            <div>
              <div className="label-sm mb-3" style={{ color: "var(--fg-muted)" }}>
                Short-horizon (1–2h) · all assets
              </div>
              <div
                className="grid gap-3"
                style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}
              >
                {data.shortHorizon.map((p) => (
                  <PredictionCard key={p.asset} prediction={p} />
                ))}
              </div>
            </div>
          )}

          {!freeMode && data && data.btcMultiTimeframe.length > 0 && (
            <div>
              <div className="label-sm mb-3" style={{ color: "var(--fg-muted)" }}>
                BTC · multi-timeframe
              </div>
              <div
                className="grid gap-3"
                style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}
              >
                {data.btcMultiTimeframe.map((p) => (
                  <PredictionCard key={p.asset} prediction={p} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Top 50 Crypto tab */}
      {!freeMode && tab === "crypto" && (
        <MarketTable
          title="Top 50 cryptocurrencies"
          subtitle="By market cap · live from CoinGecko · refreshes every 5 minutes"
          rows={markets?.crypto ?? []}
          type="crypto"
        />
      )}

      {/* Top 50 Stocks tab */}
      {!freeMode && tab === "stocks" && (
        <MarketTable
          title="Top 50 US stocks"
          subtitle="Large-cap · live from Yahoo Finance · refreshes every 5 minutes"
          rows={markets?.stocks ?? []}
          type="stocks"
        />
      )}
    </div>
  );
}
