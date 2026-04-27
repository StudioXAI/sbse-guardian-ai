"use client";

import { useState } from "react";

const SYMBOLS = [
  { value: "BINANCE:BTCUSDT", label: "BTC" },
  { value: "BINANCE:ETHUSDT", label: "ETH" },
  { value: "BINANCE:SOLUSDT", label: "SOL" },
  { value: "BINANCE:BNBUSDT", label: "BNB" },
  { value: "COINBASE:XRPUSD", label: "XRP" },
  { value: "BINANCE:DOGEUSDT", label: "DOGE" },
];

const INTERVALS = [
  { value: "15", label: "15m" },
  { value: "60", label: "1H" },
  { value: "240", label: "4H" },
  { value: "D", label: "1D" },
  { value: "W", label: "1W" },
];

export default function TradingViewWidget() {
  const [symbol, setSymbol] = useState(SYMBOLS[0].value);
  const [interval, setInterval] = useState("60");

  /* TradingView's free embed widget — no API key required.
     Theme defaults to dark, hide_top_toolbar keeps the chart minimal,
     toolbar_bg matches our background so it blends seamlessly. */
  const embedUrl =
    `https://s.tradingview.com/widgetembed/?` +
    new URLSearchParams({
      symbol,
      interval,
      hidesidetoolbar: "0",
      symboledit: "1",
      saveimage: "1",
      toolbarbg: "0d0f14",
      studies: "[]",
      theme: "dark",
      style: "1",
      timezone: "Etc/UTC",
      withdateranges: "1",
      hideideas: "1",
    });

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
        <div>
          <div className="label-sm" style={{ color: "var(--fg-muted)" }}>
            TradingView · embedded chart
          </div>
          <div className="text-[11px] mt-1" style={{ color: "var(--fg-dim)" }}>
            Open in TradingView for full Pine Script indicators (LuxAlgo, etc.)
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {SYMBOLS.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setSymbol(s.value)}
              className="px-2.5 py-1 rounded font-mono"
              style={{
                background:
                  s.value === symbol ? "var(--accent)" : "var(--bg-subtle)",
                color: s.value === symbol ? "#fff" : "var(--fg-muted)",
                border: "1px solid var(--border)",
                fontSize: "10px",
                letterSpacing: "0.05em",
                cursor: "pointer",
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-1 mb-3">
        {INTERVALS.map((i) => (
          <button
            key={i.value}
            type="button"
            onClick={() => setInterval(i.value)}
            className="px-2 py-0.5 rounded font-mono"
            style={{
              background:
                i.value === interval ? "var(--accent-dim)" : "transparent",
              color:
                i.value === interval ? "var(--accent-soft)" : "var(--fg-dim)",
              border:
                i.value === interval
                  ? "1px solid var(--border-accent)"
                  : "1px solid var(--border)",
              fontSize: "10px",
              letterSpacing: "0.05em",
              cursor: "pointer",
            }}
          >
            {i.label}
          </button>
        ))}
      </div>

      <div
        className="rounded-lg overflow-hidden"
        style={{ border: "1px solid var(--border)" }}
      >
        <iframe
          key={`${symbol}-${interval}`}
          src={embedUrl}
          style={{
            width: "100%",
            height: "480px",
            border: "none",
            display: "block",
          }}
          title="TradingView chart"
          loading="lazy"
        />
      </div>
    </div>
  );
}
