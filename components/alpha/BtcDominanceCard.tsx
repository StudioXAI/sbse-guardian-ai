"use client";

import { useCallback, useEffect } from "react";
import { alphaGet } from "@/lib/alpha/client";
import { useAutoRefresh } from "@/lib/alpha/useAutoRefresh";
import { useRefreshContext } from "@/lib/alpha/refreshContext";
import type { BtcDominanceData } from "@/lib/alpha/btcDominance";

const REFRESH_MS = 90_000;

export default function BtcDominanceCard() {
  const { reportRefresh } = useRefreshContext();

  const loader = useCallback(async () => {
    return alphaGet<BtcDominanceData>("/api/alpha/btc-dominance");
  }, []);

  const { data, lastRefreshedAt } = useAutoRefresh<BtcDominanceData>(
    loader,
    REFRESH_MS,
  );

  useEffect(() => {
    if (lastRefreshedAt !== null) reportRefresh();
  }, [lastRefreshedAt, reportRefresh]);

  /* Hide silently if data is unavailable — the rest of the predictions tab
     has plenty of content. */
  if (!data) return null;

  const directionColor =
    data.direction === "btc"
      ? "var(--success, #10b981)"
      : data.direction === "alts"
      ? "var(--warning, #f59e0b)"
      : "var(--fg-muted)";

  const arrow =
    data.direction === "btc"
      ? "↑"
      : data.direction === "alts"
      ? "↓"
      : "→";

  /* Format change with sign + 1 decimal pp. */
  const changeStr =
    data.change24hPct === 0
      ? "—"
      : `${data.change24hPct > 0 ? "+" : ""}${data.change24hPct.toFixed(2)}pp`;

  return (
    <div
      className="card p-5"
      style={{ borderLeft: `3px solid ${directionColor}` }}
    >
      <div className="flex items-start justify-between flex-wrap gap-4">
        {/* Left: BTC dominance number + label */}
        <div className="flex-1 min-w-[200px]">
          <div
            className="label-xs mb-2"
            style={{ color: directionColor, letterSpacing: "0.05em" }}
          >
            Bitcoin dominance
          </div>
          <div className="flex items-baseline gap-3">
            <div
              className="font-mono"
              style={{
                fontSize: "32px",
                color: "var(--fg)",
                fontWeight: 500,
                letterSpacing: "-0.02em",
                lineHeight: 1,
              }}
            >
              {data.btcDominancePct.toFixed(1)}%
            </div>
            <div
              className="font-mono"
              style={{
                color: directionColor,
                fontSize: "14px",
              }}
            >
              {arrow} {changeStr}
            </div>
          </div>
          <div
            className="text-[12px] mt-2"
            style={{ color: "var(--fg-muted)" }}
          >
            {data.read}. BTC market cap as % of total crypto market cap.
          </div>
        </div>

        {/* Right: companion metrics */}
        <div className="grid grid-cols-2 gap-3 min-w-[220px]">
          <Companion
            label="ETH dominance"
            value={`${data.ethDominancePct.toFixed(1)}%`}
            sub="Ethereum share"
          />
          <Companion
            label="Stables share"
            value={`${data.stablesDominancePct.toFixed(1)}%`}
            sub={
              data.stablesDominancePct > 8
                ? "Risk-off positioning"
                : data.stablesDominancePct > 5
                ? "Mixed positioning"
                : "Risk-on bias"
            }
          />
        </div>
      </div>
    </div>
  );
}

function Companion({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div
      className="p-3 rounded-lg"
      style={{ background: "var(--bg-subtle)" }}
    >
      <div
        className="text-[10px] mb-1 font-mono"
        style={{ color: "var(--fg-dim)", letterSpacing: "0.05em" }}
      >
        {label.toUpperCase()}
      </div>
      <div
        className="font-mono"
        style={{ fontSize: "18px", color: "var(--fg)" }}
      >
        {value}
      </div>
      <div
        className="text-[10px] mt-1"
        style={{ color: "var(--fg-dim)" }}
      >
        {sub}
      </div>
    </div>
  );
}
