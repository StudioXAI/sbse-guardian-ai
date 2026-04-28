"use client";

import { useAppKit, useAppKitAccount } from "@reown/appkit/react";

export type AccessState = "none" | "open";

export interface AccessStatus {
  state: AccessState;
}

interface Props {
  status: AccessStatus | null;
}

export default function AccessBanner({ status }: Props) {
  const { open } = useAppKit();
  const { isConnected } = useAppKitAccount();

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

  /* Connected — show a minimal "all features unlocked" pill. */
  return (
    <div
      className="card p-3 flex items-center justify-between gap-3 flex-wrap"
      style={{ borderLeft: "3px solid var(--accent)" }}
    >
      <div className="flex items-center gap-3">
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
    </div>
  );
}
