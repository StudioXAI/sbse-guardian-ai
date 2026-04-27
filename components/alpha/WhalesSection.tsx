"use client";

import { useEffect, useState } from "react";
import type { WhaleMove } from "@/lib/alpha/types";
import { alphaGet } from "@/lib/alpha/client";
import { directionFillVar } from "./DirectionBadge";
import { timeAgo, formatUsd } from "@/lib/alpha/format";

export default function WhalesSection() {
  const [whales, setWhales] = useState<WhaleMove[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const data = await alphaGet<WhaleMove[]>("/api/alpha/whales");
      if (!cancelled) setWhales(data ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="label-sm" style={{ color: "var(--fg-muted)" }}>
          Live whale movements
        </div>
        <span
          className="text-[10px] px-2 py-1 rounded-full font-mono"
          style={{
            background: "var(--danger-dim)",
            color: "var(--danger)",
            letterSpacing: "0.05em",
          }}
        >
          $1M+ ONLY · USDT · USDC · WETH · WBTC
        </span>
      </div>

      {whales === null && (
        <div className="text-sm" style={{ color: "var(--fg-dim)" }}>
          Loading whale feed…
        </div>
      )}

      {whales && whales.length === 0 && (
        <div className="p-4 rounded-lg" style={{ background: "var(--bg-elevated)" }}>
          <div
            className="font-mono text-[11px] mb-2"
            style={{ color: "var(--fg-dim)", letterSpacing: "0.05em" }}
          >
            NO MOVEMENTS · LAST FEW HOURS
          </div>
          <p className="text-[13px]" style={{ color: "var(--fg-muted)" }}>
            No $1M+ stablecoin or major-asset transfers on the tracked exchange
            wallets recently. The feed scans Binance, Coinbase Prime, Kraken,
            and Bitfinex hot/cold wallets every 90 seconds — large moves will
            appear here as they happen.
          </p>
        </div>
      )}

      {whales && whales.length > 0 && (
        <div className="space-y-2">
          {whales.map((w) => {
            const fill = directionFillVar(w.direction);
            const borderColor =
              w.direction === "bullish"
                ? "var(--success)"
                : w.direction === "bearish"
                ? "var(--danger)"
                : "var(--accent)";
            const sign =
              w.direction === "bearish" ? "−" : w.direction === "bullish" ? "+" : "";
            return (
              <div
                key={w.id}
                className="flex items-center justify-between p-3 rounded-lg gap-3"
                style={{
                  background: "var(--bg-elevated)",
                  borderLeft: `3px solid ${borderColor}`,
                }}
              >
                <div className="flex-1 min-w-0">
                  <div
                    className="font-mono text-[12px] truncate"
                    style={{ color: "var(--info)" }}
                  >
                    {w.address}
                  </div>
                  <div
                    className="text-[12px] mt-0.5"
                    style={{ color: "var(--fg-muted)" }}
                  >
                    {w.action} ·{" "}
                    <span className="font-mono">{timeAgo(w.timestamp)}</span>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div
                    className="font-mono font-medium"
                    style={{ fontSize: "14px", color: fill }}
                  >
                    {sign}
                    {formatUsd(w.amountUsd)}
                  </div>
                  <div className="text-[11px]" style={{ color: "var(--fg-dim)" }}>
                    {w.asset}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
