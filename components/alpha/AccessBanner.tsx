"use client";

import { useAppKit, useAppKitAccount } from "@reown/appkit/react";
import { useRefreshTicker } from "@/lib/alpha/useAutoRefresh";

export type AccessState = "none" | "open";

export interface AccessStatus {
  state: AccessState;
}

interface Props {
  status: AccessStatus | null;
  /** Most recent global refresh timestamp (epoch ms). */
  lastRefreshedAt?: number | null;
  /** Refresh interval in ms — used for "next in" countdown. */
  refreshIntervalMs?: number;
}

const REFRESH_INTERVAL_MS = 90_000;

export default function AccessBanner({
  status,
  lastRefreshedAt,
  refreshIntervalMs = REFRESH_INTERVAL_MS,
}: Props) {
  const { open } = useAppKit();
  const { isConnected } = useAppKitAccount();
  /* This drives a 1Hz re-render so the "23s ago" label stays current. */
  useRefreshTicker();

  /* Wallet not connected — invite to connect, but make it clear that
     features are free for everyone. */
  if (!isConnected) {
    return (
      <div
        className="card p-4 flex items-center justify-between gap-3 flex-wrap"
        style={{ borderLeft: "3px solid var(--accent)" }}
      >
        <div>
          <div className="label-xs mb-1" style={{ color: "var(--accent-soft)" }}>
            Connect wallet to access Alpha
          </div>
          <div className="text-[12px]" style={{ color: "var(--fg-muted)" }}>
            All features free · no payment, no KYC, no custody. The wallet is
            used only for non-custodial authentication.
          </div>
        </div>
        <button
          type="button"
          onClick={() => open()}
          className="px-4 py-2 rounded-md transition-colors"
          style={{
            background: "var(--accent)",
            color: "#fff",
            fontSize: "13px",
            fontWeight: 500,
            border: "none",
            cursor: "pointer",
            boxShadow: "0 0 16px rgba(108,99,255,0.3)",
          }}
        >
          Connect wallet
        </button>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="card p-3 text-[12px]" style={{ color: "var(--fg-dim)" }}>
        Initialising…
      </div>
    );
  }

  /* Compute live refresh status text */
  const now = Date.now();
  const sinceLast =
    lastRefreshedAt !== null && lastRefreshedAt !== undefined
      ? Math.max(0, now - lastRefreshedAt)
      : null;
  const nextIn =
    sinceLast !== null
      ? Math.max(0, refreshIntervalMs - sinceLast)
      : null;

  const refreshText = (() => {
    if (sinceLast === null) return "syncing live data…";
    const sinceSec = Math.floor(sinceLast / 1000);
    const nextSec = Math.ceil((nextIn ?? 0) / 1000);
    if (sinceSec < 5) return `refreshed just now · next in ${nextSec}s`;
    return `refreshed ${sinceSec}s ago · next in ${nextSec}s`;
  })();

  /* Connected — show "all features unlocked" pill plus live refresh ticker. */
  return (
    <div
      className="card p-3 flex items-center justify-between gap-3 flex-wrap"
      style={{ borderLeft: "3px solid var(--accent)" }}
    >
      <div className="flex items-center gap-3 flex-wrap">
        <span
          className="text-[10px] px-2 py-1 rounded-full font-mono"
          style={{
            background: "var(--accent-dim)",
            color: "var(--accent-soft)",
            letterSpacing: "0.05em",
          }}
        >
          ALL FEATURES · UNLOCKED
        </span>
        <span className="text-[11px]" style={{ color: "var(--fg-muted)" }}>
          Free for everyone. No payment, no KYC, no custody.
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span
          className="inline-block rounded-full"
          style={{
            width: 6,
            height: 6,
            background: "var(--success, #10b981)",
            boxShadow: "0 0 6px rgba(16,185,129,0.6)",
            animation: "pulse 2s ease-in-out infinite",
          }}
        />
        <span
          className="text-[10px] font-mono"
          style={{ color: "var(--fg-dim)", letterSpacing: "0.04em" }}
        >
          LIVE · {refreshText}
        </span>
      </div>
    </div>
  );
}
