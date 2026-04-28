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

export default function PredictionsSection() {
  const [data, setData] = useState<PredictionResponse | null>(null);
  const [markets, setMarkets] = useState<MarketsResp | null>(null);
  const [, setMarketsErr] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"ai" | "crypto" | "stocks">("ai");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMarketsErr(false);
    const [pred, mkt] = await Promise.all([
      alphaGet<PredictionResponse>("/api/alpha/predict"),
      alphaGet<MarketsResp>("/api/alpha/markets"),
    ]);
    if (!pred) setError("Couldn't reach the prediction engine.");
    else setData(pred);

    if (mkt) {
      setMarkets(mkt);
      if (mkt.crypto.length === 0 && mkt.stocks.length === 0) {
        setMarketsErr(true);
      }
    } else {
      setMarketsErr(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-5">
      {/* Sub-tabs */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: "ai", label: "AI Predictions", sub: "Multi-asset · Multi-timeframe" },
            { id: "crypto", label: "Top 50 Crypto", sub: "By market cap · live" },
            { id: "stocks", label: "Top 50 Stocks", sub: "US large-cap · live" },
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

      {/* AI Predictions tab */}
      {tab === "ai" && (
        <>
          {/* Alt Season Index — always rendered. */}
          <AltSeasonGauge />

          <div
            className="card p-5"
            style={{ borderLeft: "3px solid var(--accent)" }}
          >
            <div
              className="label-xs mb-3 flex items-center justify-between"
              style={{ color: "var(--accent-soft)" }}
            >
              <span>AI market summary · 1–2H forecast</span>
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
              <div
                className="p-3 rounded-lg"
                style={{ background: "var(--bg-elevated)" }}
              >
                <div
                  className="font-mono text-[11px] mb-1"
                  style={{ color: "var(--danger)", letterSpacing: "0.05em" }}
                >
                  PREDICTION ENGINE TEMPORARILY UNAVAILABLE
                </div>
                <p className="text-[12px]" style={{ color: "var(--fg-muted)" }}>
                  {error} The signals tab still works — it pulls fresh data
                  every minute.
                </p>
              </div>
            )}

            {data && (
              <p className="text-[14px] leading-relaxed" style={{ color: "var(--fg)" }}>
                {data.summary}
              </p>
            )}
          </div>

          {data && data.shortHorizon.length > 0 && (
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

          {data && data.btcMultiTimeframe.length > 0 && (
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

      {/* Top 50 Crypto */}
      {tab === "crypto" && (
        <>
          {markets && markets.crypto.length > 0 ? (
            <MarketTable
              title="Top 50 cryptocurrencies"
              subtitle="By market cap · refreshes every 5 minutes"
              rows={markets.crypto}
              type="crypto"
            />
          ) : (
            <FallbackPanel
              title="Top 50 crypto temporarily computing"
              body="Our primary market-data feed is rate-limited right now and the fallback feed is initializing. Live data will populate within a few minutes — try the AI Predictions tab in the meantime, which has its own real-time signal grounding."
              showRetry
              onRetry={load}
            />
          )}
        </>
      )}

      {/* Top 50 Stocks */}
      {tab === "stocks" && (
        <>
          {markets && markets.stocks.length > 0 ? (
            <MarketTable
              title="Top 50 US stocks"
              subtitle="Large-cap · refreshes every 5 minutes"
              rows={markets.stocks}
              type="stocks"
            />
          ) : (
            <FallbackPanel
              title="Top 50 stocks temporarily computing"
              body="The stocks feed sometimes restricts based on serverless region. The fallback path is active — check back in 2-3 minutes. Crypto data and AI Predictions are unaffected."
              showRetry
              onRetry={load}
            />
          )}
        </>
      )}

      {/* Decentralization disclaimer */}
      <div
        className="card p-3"
        style={{ background: "var(--bg-subtle)", borderColor: "var(--border)" }}
      >
        <p className="text-[11px]" style={{ color: "var(--fg-dim)" }}>
          Predictions are AI-generated based on aggregated public market
          signals. Not financial advice. SbSe Guardian Alpha is non-custodial
          — no execution, no custody, no KYC.
        </p>
      </div>
    </div>
  );
}

function FallbackPanel({
  title,
  body,
  showRetry,
  onRetry,
}: {
  title: string;
  body: string;
  showRetry?: boolean;
  onRetry?: () => void;
}) {
  return (
    <div className="card p-5" style={{ borderLeft: "3px solid var(--warning)" }}>
      <div className="label-xs mb-2" style={{ color: "var(--warning)" }}>
        {title}
      </div>
      <p className="text-[13px] mb-3 leading-relaxed" style={{ color: "var(--fg-muted)" }}>
        {body}
      </p>
      {showRetry && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="px-3 py-1.5 rounded-md transition-colors"
          style={{
            background: "var(--accent-dim)",
            color: "var(--accent-soft)",
            fontSize: "11px",
            fontWeight: 500,
            border: "1px solid var(--border-accent)",
            cursor: "pointer",
          }}
        >
          Retry now
        </button>
      )}
    </div>
  );
}
