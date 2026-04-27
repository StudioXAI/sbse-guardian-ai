"use client";

import { useAppKit, useAppKitAccount } from "@reown/appkit/react";

export type AccessState = "none" | "free" | "expired" | "plan";

export interface AccessStatus {
  state: AccessState;
  plan?: "trader" | "pro";
  planExpiresAt?: number;
  planActivatedAt?: number;
}

interface Props {
  status: AccessStatus | null;
  onUpgrade: () => void;
}

export default function AccessBanner({ status, onUpgrade }: Props) {
  const { open } = useAppKit();
  const { isConnected } = useAppKitAccount();

  /* Wallet not connected */
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
            Free tier available with limited preview. Upgrade to Trader or Pro
            for full access — pay once with USDC or USDT.
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
        Checking access status…
      </div>
    );
  }

  /* Free tier — connected but no plan */
  if (status.state === "free") {
    return (
      <div
        className="card p-4 flex items-center justify-between gap-3 flex-wrap"
        style={{ borderLeft: "3px solid var(--accent)" }}
      >
        <div>
          <div className="label-xs mb-1" style={{ color: "var(--accent-soft)" }}>
            Free plan · limited preview
          </div>
          <div className="text-[12px]" style={{ color: "var(--fg-muted)" }}>
            3 most-recent signals (1h delay), 1 prediction, INFI ecosystem,
            social. Upgrade for live signals, predictions, whale tracking,
            and the full liquidity map.
          </div>
        </div>
        <button
          type="button"
          onClick={onUpgrade}
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
          Upgrade
        </button>
      </div>
    );
  }

  /* Expired plan */
  if (status.state === "expired") {
    return (
      <div
        className="card p-4 flex items-center justify-between gap-3 flex-wrap"
        style={{ borderLeft: "3px solid var(--danger)" }}
      >
        <div>
          <div className="label-xs mb-1" style={{ color: "var(--danger)" }}>
            Plan expired · back to Free preview
          </div>
          <div className="text-[12px]" style={{ color: "var(--fg-muted)" }}>
            Your 30-day plan has ended. You're now on the Free tier — renew
            to restore full access.
          </div>
        </div>
        <button
          type="button"
          onClick={onUpgrade}
          className="px-4 py-2 rounded-md transition-colors"
          style={{
            background: "var(--accent)",
            color: "#fff",
            fontSize: "13px",
            fontWeight: 500,
            border: "none",
            cursor: "pointer",
          }}
        >
          Renew
        </button>
      </div>
    );
  }

  /* Active plan — also covers the silent receiver case (mapped to plan/pro) */
  if (status.state === "plan" && status.plan) {
    const planLabel = status.plan === "pro" ? "Pro" : "Trader";
    const expiresAt = status.planExpiresAt ?? 0;
    const daysLeft = Math.max(
      0,
      Math.ceil((expiresAt - Date.now()) / (24 * 60 * 60 * 1000)),
    );
    /* For very long expirations (e.g., the receiver case), suppress the
       countdown so it doesn't read as suspicious. Users on a real plan
       will see "X DAYS LEFT" since X is between 1 and 30. */
    const showCountdown = daysLeft <= 365;
    const isWarning = daysLeft <= 3 && showCountdown;
    const color = isWarning ? "var(--warning)" : "var(--accent)";
    const colorDim = isWarning ? "var(--warning-dim)" : "var(--accent-dim)";

    const tagText = showCountdown
      ? `${planLabel.toUpperCase()} · ${daysLeft} ${daysLeft === 1 ? "DAY" : "DAYS"} LEFT`
      : `${planLabel.toUpperCase()} · ACTIVE`;

    const helperText = showCountdown
      ? isWarning
        ? "Renew soon to keep access."
        : "Active."
      : "Active.";

    return (
      <div
        className="card p-3 flex items-center justify-between gap-3 flex-wrap"
        style={{ borderLeft: `3px solid ${color}` }}
      >
        <div className="flex items-center gap-3">
          <span
            className="text-[10px] px-2 py-1 rounded-full font-mono"
            style={{
              background: colorDim,
              color,
              letterSpacing: "0.05em",
            }}
          >
            {tagText}
          </span>
          <span className="text-[11px]" style={{ color: "var(--fg-muted)" }}>
            {helperText}
          </span>
        </div>
        {isWarning && (
          <button
            type="button"
            onClick={onUpgrade}
            className="px-3 py-1.5 rounded-md transition-colors"
            style={{
              background: "var(--warning-dim)",
              color: "var(--warning)",
              fontSize: "12px",
              fontWeight: 500,
              border: "1px solid rgba(250,204,21,0.25)",
              cursor: "pointer",
            }}
          >
            Renew now
          </button>
        )}
      </div>
    );
  }

  return null;
}
