"use client";

import { useCallback, useEffect } from "react";
import type { Signal } from "@/lib/alpha/types";
import { alphaGet } from "@/lib/alpha/client";
import { useAutoRefresh } from "@/lib/alpha/useAutoRefresh";
import { useRefreshContext } from "@/lib/alpha/refreshContext";
import SignalRow from "./SignalRow";

const REFRESH_MS = 90_000;

interface SignalFeeds {
  market: Signal[];
  infi: Signal[];
}

export default function SignalsSection() {
  const { reportRefresh } = useRefreshContext();

  const loader = useCallback(async (): Promise<SignalFeeds | null> => {
    const [m, i] = await Promise.all([
      alphaGet<Signal[]>("/api/alpha/signals?filter=market"),
      alphaGet<Signal[]>("/api/alpha/signals?filter=infi"),
    ]);
    if (m === null && i === null) return null;
    return { market: m ?? [], infi: i ?? [] };
  }, []);

  const { data, lastRefreshedAt } = useAutoRefresh<SignalFeeds>(
    loader,
    REFRESH_MS,
  );

  useEffect(() => {
    if (lastRefreshedAt !== null) reportRefresh();
  }, [lastRefreshedAt, reportRefresh]);

  const market = data?.market ?? null;
  const infi = data?.infi ?? null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="label-sm" style={{ color: "var(--fg-muted)" }}>
              Market signals
            </div>
            <span
              className="text-[10px] px-2 py-1 rounded-full font-mono"
              style={{
                background: "var(--accent-dim)",
                color: "var(--accent-soft)",
                letterSpacing: "0.05em",
              }}
            >
              {market === null ? "…" : `${market.length} live`}
            </span>
          </div>
          {market === null ? (
            <div className="text-sm" style={{ color: "var(--fg-dim)" }}>
              Loading…
            </div>
          ) : market.length === 0 ? (
            <div className="text-sm" style={{ color: "var(--fg-dim)" }}>
              No active market signals.
            </div>
          ) : (
            market.map((s) => <SignalRow key={s.id} signal={s} />)
          )}
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="label-sm" style={{ color: "var(--fg-muted)" }}>
              INFI ecosystem signals
            </div>
            <span
              className="text-[10px] px-2 py-1 rounded-full font-mono"
              style={{
                background: "var(--accent-dim)",
                color: "var(--accent-soft)",
                letterSpacing: "0.05em",
              }}
            >
              Guardian tracked
            </span>
          </div>
          {infi === null ? (
            <div className="text-sm" style={{ color: "var(--fg-dim)" }}>
              Loading…
            </div>
          ) : infi.length === 0 ? (
            <div className="text-sm" style={{ color: "var(--fg-dim)" }}>
              No INFI signals right now.
            </div>
          ) : (
            infi.map((s) => <SignalRow key={s.id} signal={s} />)
          )}
        </div>
      </div>
    </div>
  );
}
