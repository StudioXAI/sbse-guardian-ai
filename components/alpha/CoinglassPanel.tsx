"use client";

import { useEffect, useState } from "react";
import { alphaGet } from "@/lib/alpha/client";
import { formatUsd } from "@/lib/alpha/format";
import type { CoinglassSnapshot } from "@/lib/alpha/coinglassClient";

interface CoinglassResp {
  configured: boolean;
  snapshot: CoinglassSnapshot | null;
}

export default function CoinglassPanel() {
  const [data, setData] = useState<CoinglassResp | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await alphaGet<CoinglassResp>("/api/alpha/coinglass");
      if (!cancelled) setData(result);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data) {
    return (
      <div className="card p-5">
        <p className="text-sm" style={{ color: "var(--fg-dim)" }}>
          Loading Coinglass…
        </p>
      </div>
    );
  }

  if (!data.configured) {
    return (
      <div
        className="card p-5"
        style={{ borderLeft: "3px solid var(--warning)" }}
      >
        <div className="label-xs mb-2" style={{ color: "var(--warning)" }}>
          Coinglass · not configured
        </div>
        <p className="text-[13px] mb-3" style={{ color: "var(--fg)" }}>
          Liquidation heatmaps, open interest, and funding rates from Coinglass.
          Free tier available — register for an API key, then set{" "}
          <code
            className="px-1.5 py-0.5 rounded font-mono text-[12px]"
            style={{
              background: "var(--bg-subtle)",
              color: "var(--accent-soft)",
            }}
          >
            COINGLASS_API_KEY
          </code>{" "}
          in your Vercel environment variables.
        </p>
        <a
          href="https://www.coinglass.com/api"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block px-3 py-1.5 rounded-md font-mono"
          style={{
            background: "var(--bg-subtle)",
            color: "var(--fg)",
            border: "1px solid var(--border)",
            fontSize: "11px",
            letterSpacing: "0.05em",
            textDecoration: "none",
          }}
        >
          coinglass.com/api ↗
        </a>
      </div>
    );
  }

  if (!data.snapshot) {
    return (
      <div
        className="card p-5"
        style={{ borderLeft: "3px solid var(--danger)" }}
      >
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          Coinglass returned no data. Verify your API key is valid and not rate-limited.
        </p>
      </div>
    );
  }

  const snap = data.snapshot;

  return (
    <div className="space-y-4">
      <div
        className="card p-3 flex items-center justify-between flex-wrap gap-2"
        style={{ borderLeft: "3px solid var(--accent)" }}
      >
        <div className="label-xs" style={{ color: "var(--accent-soft)" }}>
          Coinglass · liquidations · OI · funding
        </div>
        <a
          href="https://www.coinglass.com"
          target="_blank"
          rel="noopener noreferrer"
          className="px-2.5 py-1 rounded font-mono"
          style={{
            background: "var(--bg-subtle)",
            color: "var(--fg-muted)",
            border: "1px solid var(--border)",
            fontSize: "10px",
            letterSpacing: "0.05em",
            textDecoration: "none",
          }}
        >
          coinglass.com ↗
        </a>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {/* Liquidations */}
        <div className="card p-4">
          <div className="label-sm mb-3" style={{ color: "var(--fg-muted)" }}>
            Liquidations · 24h
          </div>
          {snap.liquidations.length === 0 ? (
            <p className="text-[12px]" style={{ color: "var(--fg-dim)" }}>
              No data.
            </p>
          ) : (
            <div className="space-y-2">
              {snap.liquidations.slice(0, 5).map((l) => (
                <div
                  key={l.symbol}
                  className="flex items-center justify-between text-[12px]"
                >
                  <span className="font-medium" style={{ color: "var(--fg)" }}>
                    {l.symbol}
                  </span>
                  <span
                    className="font-mono"
                    style={{ color: "var(--danger)" }}
                  >
                    {formatUsd(l.totalLiquidationUsd24h)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Funding rates */}
        <div className="card p-4">
          <div className="label-sm mb-3" style={{ color: "var(--fg-muted)" }}>
            Funding rates · annualized
          </div>
          {snap.fundingRates.length === 0 ? (
            <p className="text-[12px]" style={{ color: "var(--fg-dim)" }}>
              No data.
            </p>
          ) : (
            <div className="space-y-2">
              {snap.fundingRates.slice(0, 5).map((f, i) => {
                const color =
                  f.annualizedPct > 5
                    ? "var(--success)"
                    : f.annualizedPct < -5
                    ? "var(--danger)"
                    : "var(--fg-muted)";
                return (
                  <div
                    key={`${f.symbol}-${f.exchange}-${i}`}
                    className="flex items-center justify-between text-[12px]"
                  >
                    <span style={{ color: "var(--fg)" }}>
                      <span className="font-medium">{f.symbol}</span>
                      <span
                        className="ml-1.5 text-[10px]"
                        style={{ color: "var(--fg-dim)" }}
                      >
                        {f.exchange}
                      </span>
                    </span>
                    <span className="font-mono" style={{ color }}>
                      {f.annualizedPct >= 0 ? "+" : ""}
                      {f.annualizedPct.toFixed(2)}%
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Open interest */}
        <div className="card p-4">
          <div className="label-sm mb-3" style={{ color: "var(--fg-muted)" }}>
            Open interest · 24h Δ
          </div>
          {snap.openInterest.length === 0 ? (
            <p className="text-[12px]" style={{ color: "var(--fg-dim)" }}>
              No data.
            </p>
          ) : (
            <div className="space-y-2">
              {snap.openInterest.slice(0, 5).map((o, i) => {
                const color =
                  o.change24hPct > 1
                    ? "var(--success)"
                    : o.change24hPct < -1
                    ? "var(--danger)"
                    : "var(--fg-muted)";
                return (
                  <div
                    key={`${o.symbol}-${i}`}
                    className="text-[12px]"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium" style={{ color: "var(--fg)" }}>
                        {o.symbol}
                      </span>
                      <span className="font-mono" style={{ color }}>
                        {o.change24hPct >= 0 ? "+" : ""}
                        {o.change24hPct.toFixed(2)}%
                      </span>
                    </div>
                    <div
                      className="font-mono text-[10px] mt-0.5"
                      style={{ color: "var(--fg-dim)" }}
                    >
                      {formatUsd(o.openInterestUsd)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
