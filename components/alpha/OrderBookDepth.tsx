"use client";

import { useEffect, useState } from "react";
import { alphaGet } from "@/lib/alpha/client";
import { formatUsd } from "@/lib/alpha/format";
import type { OrderBookSnapshot } from "@/lib/alpha/orderbookClient";

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT"];

export default function OrderBookDepth() {
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [book, setBook] = useState<OrderBookSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function load() {
      const data = await alphaGet<OrderBookSnapshot>(
        `/api/alpha/orderbook?symbol=${symbol}`,
      );
      if (cancelled) return;
      if (!data) {
        setError("Order book unavailable.");
      } else {
        setBook(data);
        setError(null);
      }
    }

    void load();
    /* Refresh every 5 seconds for near-real-time feel. */
    timer = setInterval(load, 5_000);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [symbol]);

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <div className="label-sm" style={{ color: "var(--fg-muted)" }}>
            Order Book Depth · Source: Binance
          </div>
          <div className="text-[11px] mt-1" style={{ color: "var(--fg-dim)" }}>
            Bookmap-equivalent real-time depth · refreshes every 5s
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {SYMBOLS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSymbol(s)}
              className="px-2.5 py-1 rounded font-mono"
              style={{
                background:
                  s === symbol ? "var(--accent)" : "var(--bg-subtle)",
                color: s === symbol ? "#fff" : "var(--fg-muted)",
                border: "1px solid var(--border)",
                fontSize: "10px",
                letterSpacing: "0.05em",
                cursor: "pointer",
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      {!book && !error && (
        <p className="text-sm" style={{ color: "var(--fg-dim)" }}>
          Loading order book…
        </p>
      )}

      {book && (
        <>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Stat label="Mid price" value={`$${book.midPrice.toFixed(2)}`} />
            <Stat label="Spread" value={`${book.spreadPct.toFixed(4)}%`} />
            <Stat
              label="Imbalance"
              value={`${book.imbalancePct >= 0 ? "+" : ""}${book.imbalancePct.toFixed(1)}%`}
              tone={
                book.imbalancePct > 5
                  ? "good"
                  : book.imbalancePct < -5
                  ? "bad"
                  : "neutral"
              }
            />
          </div>

          <DepthChart book={book} />

          <div className="grid grid-cols-2 gap-2 mt-4 text-[11px]">
            <div
              className="p-2 rounded"
              style={{
                background: "rgba(74,222,128,0.06)",
                borderLeft: "2px solid var(--success)",
              }}
            >
              <div style={{ color: "var(--fg-dim)" }}>Bid wall (buy support)</div>
              <div
                className="font-mono mt-0.5"
                style={{ color: "var(--success)", fontSize: "13px" }}
              >
                {formatUsd(book.bidWallNotional)}
              </div>
            </div>
            <div
              className="p-2 rounded"
              style={{
                background: "rgba(248,113,113,0.06)",
                borderLeft: "2px solid var(--danger)",
              }}
            >
              <div style={{ color: "var(--fg-dim)" }}>Ask wall (sell pressure)</div>
              <div
                className="font-mono mt-0.5"
                style={{ color: "var(--danger)", fontSize: "13px" }}
              >
                {formatUsd(book.askWallNotional)}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "good" | "bad" | "neutral";
}) {
  const color =
    tone === "good"
      ? "var(--success)"
      : tone === "bad"
      ? "var(--danger)"
      : "var(--fg)";
  return (
    <div className="p-2 rounded" style={{ background: "var(--bg-subtle)" }}>
      <div
        className="text-[10px]"
        style={{ color: "var(--fg-dim)", letterSpacing: "0.05em" }}
      >
        {label}
      </div>
      <div className="font-mono" style={{ fontSize: "13px", color }}>
        {value}
      </div>
    </div>
  );
}

function DepthChart({ book }: { book: OrderBookSnapshot }) {
  /* Render an SVG cumulative-depth curve like Bookmap.
     Bids on left in green, asks on right in red. */
  const width = 600;
  const height = 140;
  const maxNotional = Math.max(book.bidWallNotional, book.askWallNotional, 1);

  const allPrices = [
    ...book.bids.map((b) => b.price),
    ...book.asks.map((a) => a.price),
  ];
  const minPrice = Math.min(...allPrices);
  const maxPrice = Math.max(...allPrices);
  const priceRange = maxPrice - minPrice || 1;

  const pricToX = (p: number) => ((p - minPrice) / priceRange) * width;
  const notionalToY = (n: number) => height - (n / maxNotional) * height;

  const bidPoints: string[] = [];
  bidPoints.push(`${pricToX(book.bids[book.bids.length - 1].price)},${height}`);
  for (let i = book.bids.length - 1; i >= 0; i--) {
    const x = pricToX(book.bids[i].price);
    const y = notionalToY(book.bids[i].notionalUsd);
    bidPoints.push(`${x},${y}`);
  }
  bidPoints.push(`${pricToX(book.bids[0].price)},${height}`);

  const askPoints: string[] = [];
  askPoints.push(`${pricToX(book.asks[0].price)},${height}`);
  for (const level of book.asks) {
    const x = pricToX(level.price);
    const y = notionalToY(level.notionalUsd);
    askPoints.push(`${x},${y}`);
  }
  askPoints.push(`${pricToX(book.asks[book.asks.length - 1].price)},${height}`);

  return (
    <div className="relative" style={{ width: "100%", height }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        style={{ width: "100%", height: "100%", display: "block" }}
      >
        {/* Bid (buy) area */}
        <polygon points={bidPoints.join(" ")} fill="rgba(74,222,128,0.18)" />
        <polyline
          points={bidPoints.slice(1, -1).join(" ")}
          fill="none"
          stroke="var(--success)"
          strokeWidth="1.2"
        />
        {/* Ask (sell) area */}
        <polygon points={askPoints.join(" ")} fill="rgba(248,113,113,0.18)" />
        <polyline
          points={askPoints.slice(1, -1).join(" ")}
          fill="none"
          stroke="var(--danger)"
          strokeWidth="1.2"
        />
        {/* Mid price line */}
        <line
          x1={pricToX(book.midPrice)}
          y1={0}
          x2={pricToX(book.midPrice)}
          y2={height}
          stroke="var(--accent)"
          strokeWidth="1"
          strokeDasharray="3,3"
          opacity="0.6"
        />
      </svg>
      <div
        className="absolute font-mono text-[10px]"
        style={{
          left: 6,
          top: 6,
          color: "var(--success)",
          letterSpacing: "0.05em",
        }}
      >
        BIDS
      </div>
      <div
        className="absolute font-mono text-[10px]"
        style={{
          right: 6,
          top: 6,
          color: "var(--danger)",
          letterSpacing: "0.05em",
        }}
      >
        ASKS
      </div>
    </div>
  );
}
