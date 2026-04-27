"use client";

import { useEffect, useState } from "react";
import type { Signal } from "@/lib/alpha/types";
import { alphaGet } from "@/lib/alpha/client";
import SignalRow from "./SignalRow";

interface Props {
  /** When true, applies free-tier limits: 3 signals max, 1-hour delay. */
  freeMode?: boolean;
  onUpgrade?: () => void;
}

const FREE_DELAY_MS = 60 * 60 * 1000; // 1 hour
const FREE_MAX_SIGNALS = 3;

export default function SignalsSection({ freeMode = false, onUpgrade }: Props) {
  const [market, setMarket] = useState<Signal[] | null>(null);
  const [infi, setInfi] = useState<Signal[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [m, i] = await Promise.all([
        alphaGet<Signal[]>("/api/alpha/signals?filter=market"),
        alphaGet<Signal[]>("/api/alpha/signals?filter=infi"),
      ]);
      if (cancelled) return;

      if (freeMode) {
        const cutoff = Date.now() - FREE_DELAY_MS;
        setMarket(
          (m ?? []).filter((s) => s.timestamp <= cutoff).slice(0, FREE_MAX_SIGNALS),
        );
        setInfi(
          (i ?? []).filter((s) => s.timestamp <= cutoff).slice(0, FREE_MAX_SIGNALS),
        );
      } else {
        setMarket(m ?? []);
        setInfi(i ?? []);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [freeMode]);

  return (
    <div className="space-y-4">
      {freeMode && (
        <div
          className="card p-3 flex items-center justify-between gap-3 flex-wrap"
          style={{ borderLeft: "3px solid var(--accent)" }}
        >
          <div className="text-[12px]" style={{ color: "var(--fg-muted)" }}>
            <span style={{ color: "var(--accent-soft)" }}>Free preview</span> ·
            showing 3 most-recent signals with 1-hour delay. Upgrade for the
            full real-time feed.
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
              {market === null
                ? "…"
                : freeMode
                ? `${market.length} (delayed)`
                : `${market.length} live`}
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
