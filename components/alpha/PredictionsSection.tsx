"use client";

import { useCallback, useEffect, useState } from "react";
import type { PredictionResponse } from "@/lib/alpha/types";
import { alphaGet } from "@/lib/alpha/client";
import PredictionCard from "./PredictionCard";

interface Props {
  /** Free tier: hide per-asset cards and multi-timeframe sections. */
  freeMode?: boolean;
  onUpgrade?: () => void;
}

export default function PredictionsSection({ freeMode = false, onUpgrade }: Props) {
  const [data, setData] = useState<PredictionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await alphaGet<PredictionResponse>("/api/alpha/predict");
    if (!result) setError("Couldn't reach the prediction engine.");
    else setData(result);
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
            AI summary only. Upgrade for multi-asset directional cards and
            multi-timeframe BTC forecasts.
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

      <div className="card p-5" style={{ borderLeft: "3px solid var(--accent)" }}>
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

      {!freeMode && data && (
        <>
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
        </>
      )}
    </div>
  );
}
