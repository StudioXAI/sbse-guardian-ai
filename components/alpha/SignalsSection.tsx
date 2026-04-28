"use client";

import { useEffect, useState } from "react";
import type { Signal } from "@/lib/alpha/types";
import { alphaGet } from "@/lib/alpha/client";
import SignalRow from "./SignalRow";

export default function SignalsSection() {
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
      setMarket(m ?? []);
      setInfi(i ?? []);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

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
