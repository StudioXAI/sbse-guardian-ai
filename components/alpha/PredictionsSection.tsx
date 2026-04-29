"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PredictionResponse, AssetPrediction } from "@/lib/alpha/types";
import { alphaGet } from "@/lib/alpha/client";
import { useRefreshContext } from "@/lib/alpha/refreshContext";
import PredictionCard from "./PredictionCard";
import MarketTable from "./MarketTable";
import AltSeasonGauge from "./AltSeasonGauge";
import BtcDominanceCard from "./BtcDominanceCard";
import type { CryptoRow, StockRow } from "@/lib/alpha/topMarketsClient";

const REFRESH_MS = 90_000;

/* Threshold (in confidence points) below which we consider a change in a
   prediction "noise" and don't replace the displayed text. Anything above
   this triggers a display update. Picked at 5 — matches our display
   rounding granularity. */
const CONFIDENCE_NOISE_THRESHOLD = 5;

interface MarketsResp {
  crypto: CryptoRow[];
  stocks: StockRow[];
  generatedAt: number;
}

/* ─────────────────────────────────────────────────────────────
   Stability helpers
   ───────────────────────────────────────────────────────────── */

/* Sort predictions by asset name so the card order never changes
   between refreshes — only the values inside each card update. */
function sortByAsset(arr: AssetPrediction[]): AssetPrediction[] {
  return [...arr].sort((a, b) => a.asset.localeCompare(b.asset));
}

/* Build a "signature" of a prediction so we can tell when something
   meaningful actually changed. We hash direction + rounded confidence
   per asset. If the signature matches the previously-shown one, we
   keep the old display to prevent jitter from minor confidence ticks
   or AI rephrasing. */
function predictionSignature(p: PredictionResponse): string {
  const sig = (arr: AssetPrediction[]) =>
    sortByAsset(arr)
      .map(
        (x) =>
          `${x.asset}:${x.direction}:${Math.round(x.confidence / 5) * 5}`,
      )
      .join("|");
  return `${sig(p.shortHorizon)}#${sig(p.btcMultiTimeframe)}`;
}

export default function PredictionsSection() {
  const { reportRefresh } = useRefreshContext();
  const [data, setData] = useState<PredictionResponse | null>(null);
  const [markets, setMarkets] = useState<MarketsResp | null>(null);
  const [, setMarketsErr] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"ai" | "crypto" | "stocks">("ai");
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  /* Track the last accepted signature so we only re-render on real
     changes. Stored in a ref so it doesn't trigger re-renders itself. */
  const lastSigRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    /* Don't toggle the loading spinner on background re-fetches —
       only on the very first load. */
    setError(null);
    setMarketsErr(false);
    const [pred, mkt] = await Promise.all([
      alphaGet<PredictionResponse>("/api/alpha/predict"),
      alphaGet<MarketsResp>("/api/alpha/markets"),
    ]);

    if (!pred) {
      if (data === null) setError("Couldn't reach the prediction engine.");
    } else {
      const newSig = predictionSignature(pred);
      const sigChanged = newSig !== lastSigRef.current;
      /* Stabilize: only swap displayed predictions when the signature
         (direction + rounded confidence per asset) actually changed.
         If it didn't change, keep showing the same text/cards — the
         underlying signals haven't moved enough to justify a re-render
         that the user might perceive as "jumping". */
      if (sigChanged) {
        /* Sort cards alphabetically so order is stable forever, and
           replace data with new payload (sorted in-place). */
        const stable: PredictionResponse = {
          ...pred,
          shortHorizon: sortByAsset(pred.shortHorizon),
          btcMultiTimeframe: sortByAsset(pred.btcMultiTimeframe),
        };
        setData(stable);
        lastSigRef.current = newSig;
        setLastUpdated(Date.now());
      } else if (data === null) {
        /* First time we got data — accept it even if signature is the
           same (compared against null). */
        const stable: PredictionResponse = {
          ...pred,
          shortHorizon: sortByAsset(pred.shortHorizon),
          btcMultiTimeframe: sortByAsset(pred.btcMultiTimeframe),
        };
        setData(stable);
        lastSigRef.current = newSig;
        setLastUpdated(Date.now());
      }
      /* Else: signature unchanged AND we already have data → do nothing.
         The visible cards stay identical, no flicker. */
    }

    if (mkt) {
      setMarkets(mkt);
      if (mkt.crypto.length === 0 && mkt.stocks.length === 0) {
        setMarketsErr(true);
      }
    } else {
      setMarketsErr(true);
    }
    setLoading(false);
    /* Both endpoints are 5min-cached server-side (predict for cost,
       markets for traffic). Page polling at 90s is safe — server returns
       cached data when it's fresh. */
    if (pred || mkt) reportRefresh();
  }, [data, reportRefresh]);

  useEffect(() => {
    void load();
    const handle = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void load();
    }, REFRESH_MS);
    return () => window.clearInterval(handle);
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
          {/* BTC Dominance — top-of-tab macro context */}
          <BtcDominanceCard />

          {/* Alt Season Index — always rendered. */}
          <AltSeasonGauge />

          <div
            className="card p-5"
            style={{ borderLeft: "3px solid var(--accent)" }}
          >
            <div
              className="label-xs mb-3 flex items-center justify-between flex-wrap gap-2"
              style={{ color: "var(--accent-soft)" }}
            >
              <span className="flex items-center gap-3 flex-wrap">
                <span>AI market summary · 1–2H forecast</span>
                {lastUpdated && (
                  <span
                    className="text-[10px] font-mono"
                    style={{
                      color: "var(--fg-dim)",
                      letterSpacing: "0.05em",
                      textTransform: "none",
                    }}
                  >
                    {formatLastUpdated(lastUpdated)}
                  </span>
                )}
              </span>
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
              title="Top 50 crypto loading"
              body="Live market data is fetching. Refresh in a moment if this persists."
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
              title="Top 50 stocks loading"
              body="Live stock data is fetching. Refresh in a moment if this persists."
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

/* ─────────────────────────────────────────────────────────────
   Helpers
   ───────────────────────────────────────────────────────────── */

function formatLastUpdated(ts: number): string {
  const ageSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (ageSec < 60) return "Updated just now";
  if (ageSec < 3600) {
    const mins = Math.floor(ageSec / 60);
    return `Updated ${mins}m ago`;
  }
  const hours = Math.floor(ageSec / 3600);
  return `Updated ${hours}h ago`;
}
