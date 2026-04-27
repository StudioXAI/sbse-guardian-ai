"use client";

import { useEffect, useState } from "react";
import type { PolymarketBet } from "@/lib/alpha/types";
import { alphaGet } from "@/lib/alpha/client";
import { formatUsd } from "@/lib/alpha/format";
import DirectionBadge from "./DirectionBadge";

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
    <div>
      <div className="label-sm mb-4" style={{ color: "var(--fg-muted)" }}>
        Real-money prediction markets · consensus signals
      </div>

      {bets === null ? (
        <div className="text-sm" style={{ color: "var(--fg-dim)" }}>
          Loading…
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {bets.map((bet) => {
            const noPct = 100 - bet.yesPct;
            return (
              <div key={bet.id} className="card p-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <p
                    className="text-[13px] font-medium leading-snug flex-1"
                    style={{ color: "var(--fg)" }}
                  >
                    {bet.question}
                  </p>
                  <DirectionBadge direction={bet.signalDirection} size="sm" />
                </div>

                <div
                  className="flex h-[6px] rounded-full overflow-hidden mb-2"
                  style={{ background: "var(--border)" }}
                >
                  <div style={{ width: `${bet.yesPct}%`, background: "var(--success)" }} />
                  <div style={{ width: `${noPct}%`, background: "var(--danger)" }} />
                </div>

                <div className="flex justify-between items-center text-[11px] mb-2">
                  <span style={{ color: "var(--success)", fontWeight: 500 }}>
                    YES {bet.yesPct}%
                  </span>
                  <span className="font-mono" style={{ color: "var(--fg-dim)" }}>
                    {formatUsd(bet.volumeUsd)} bet
                  </span>
                  <span style={{ color: "var(--danger)", fontWeight: 500 }}>
                    NO {noPct}%
                  </span>
                </div>

                {bet.signalNote && (
                  <p
                    className="text-[11px] leading-snug pt-2 border-t"
                    style={{
                      color: "var(--fg-muted)",
                      borderColor: "var(--border)",
                    }}
                  >
                    {bet.signalNote}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
