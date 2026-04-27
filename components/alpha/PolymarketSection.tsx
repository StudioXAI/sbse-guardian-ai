"use client";

import { useEffect, useState } from "react";
import type { PolymarketBet } from "@/lib/alpha/types";
import { alphaGet } from "@/lib/alpha/client";
import { directionFillVar } from "./DirectionBadge";
import { formatUsd } from "@/lib/alpha/format";

export default function PolymarketSection() {
  const [bets, setBets] = useState<PolymarketBet[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const data = await alphaGet<PolymarketBet[]>("/api/alpha/polymarket");
      if (!cancelled) setBets(data ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="label-sm" style={{ color: "var(--fg-muted)" }}>
          Real-money prediction markets · consensus signals
        </div>
        <a
          href="https://polymarket.com"
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
          polymarket.com ↗
        </a>
      </div>

      {bets === null && (
        <div className="text-sm" style={{ color: "var(--fg-dim)" }}>
          Loading Polymarket consensus…
        </div>
      )}

      {bets && bets.length === 0 && (
        <div className="p-4 rounded-lg" style={{ background: "var(--bg-elevated)" }}>
          <div
            className="font-mono text-[11px] mb-2"
            style={{ color: "var(--fg-dim)", letterSpacing: "0.05em" }}
          >
            NO HIGH-VOLUME MARKETS RIGHT NOW
          </div>
          <p className="text-[13px]" style={{ color: "var(--fg-muted)" }}>
            Polymarket returned no active markets above the $50K volume
            threshold. This usually clears up within a few minutes — refresh to
            try again.
          </p>
        </div>
      )}

      {bets && bets.length > 0 && (
        <div className="space-y-3">
          {bets.map((b) => {
            const fill = directionFillVar(b.signalDirection);
            const borderColor =
              b.signalDirection === "bullish"
                ? "var(--success)"
                : b.signalDirection === "bearish"
                ? "var(--danger)"
                : "var(--accent)";
            return (
              <div
                key={b.id}
                className="p-4 rounded-lg"
                style={{
                  background: "var(--bg-elevated)",
                  borderLeft: `3px solid ${borderColor}`,
                }}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <p
                    className="text-[13px] font-medium leading-snug flex-1"
                    style={{ color: "var(--fg)" }}
                  >
                    {b.question}
                  </p>
                  <div className="text-right flex-shrink-0">
                    <div
                      className="font-mono font-medium"
                      style={{ fontSize: "16px", color: fill }}
                    >
                      {b.yesPct}%
                    </div>
                    <div
                      className="text-[10px]"
                      style={{ color: "var(--fg-dim)" }}
                    >
                      YES
                    </div>
                  </div>
                </div>

                <div
                  className="h-[3px] rounded-full mb-2"
                  style={{ background: "var(--border)" }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${b.yesPct}%`,
                      background: fill,
                    }}
                  />
                </div>

                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span
                    className="text-[11px]"
                    style={{ color: "var(--fg-muted)" }}
                  >
                    {b.signalNote}
                  </span>
                  <span
                    className="font-mono text-[10px]"
                    style={{ color: "var(--fg-dim)" }}
                  >
                    {formatUsd(b.volumeUsd)} · 24h
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
