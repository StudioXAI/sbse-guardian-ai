"use client";

import type { ThreatsPayload, SuspiciousSell } from "@/lib/alpha/threatTracker";
import type { RiskReason } from "@/lib/alpha/dexEventScanner";
import { formatUsd, timeAgo } from "@/lib/alpha/format";

interface Props {
  data: ThreatsPayload | null;
}

export default function SuspiciousSellsPanel({ data }: Props) {
  if (data === null) {
    return (
      <div className="card p-5">
        <div className="text-sm" style={{ color: "var(--fg-dim)" }}>
          Scanning live blockchain activity for suspicious sells…
        </div>
      </div>
    );
  }

  /* QuickNode not configured — show actionable guidance. */
  if (!data.scannerStatus.quicknodeConfigured) {
    return (
      <div
        className="card p-5"
        style={{ borderLeft: "3px solid var(--warning, #f59e0b)" }}
      >
        <div
          className="label-xs mb-2"
          style={{ color: "var(--warning, #f59e0b)" }}
        >
          Live blockchain scanner not configured
        </div>
        <p
          className="text-[13px] mb-3 leading-relaxed"
          style={{ color: "var(--fg-muted)" }}
        >
          The Threats tab needs a QuickNode RPC endpoint to scan live
          blockchain activity. Without it, only the Risk Events sub-tab
          (Etherscan-based) is operational.
        </p>
        <p className="text-[12px]" style={{ color: "var(--fg-dim)" }}>
          To enable: register a free or $10/mo QuickNode account at{" "}
          <a
            href="https://www.quicknode.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--accent-soft)" }}
          >
            quicknode.com
          </a>
          , create a multi-chain endpoint, and add{" "}
          <code style={{ color: "var(--accent-soft)" }}>
            QUICKNODE_BASE_URL
          </code>{" "}
          to your Vercel environment variables. All 6 chains
          (Ethereum/BSC/Polygon/Arbitrum/Optimism/Base) auto-enable from
          the single base URL. For legacy single-chain endpoints, set per-chain
          vars instead (
          <code style={{ color: "var(--accent-soft)" }}>QUICKNODE_ETH_URL</code>,{" "}
          <code style={{ color: "var(--accent-soft)" }}>QUICKNODE_BSC_URL</code>,{" "}
          etc.) — these override the base URL when present.
        </p>
      </div>
    );
  }

  if (data.suspiciousSells.length === 0) {
    return (
      <div className="card p-5">
        <div
          className="font-mono text-[11px] mb-2"
          style={{ color: "var(--fg-dim)", letterSpacing: "0.05em" }}
        >
          NO SUSPICIOUS SELLS IN THE LAST SCAN WINDOW
        </div>
        <p
          className="text-[13px] mb-3"
          style={{ color: "var(--fg-muted)" }}
        >
          The whole-chain scanner found no swaps meeting suspicion
          thresholds (≥1% pool impact, large size, or wallet flags) in the
          last ~30 blocks across {data.chainsScanned.length}{" "}
          {data.chainsScanned.length === 1 ? "chain" : "chains"}. Scanner
          refreshes every 90 seconds.
        </p>
        <p
          className="text-[10px] font-mono"
          style={{ color: "var(--fg-dim)", letterSpacing: "0.05em" }}
        >
          {data.totalEventsSeen.toLocaleString()} swap events scanned ·{" "}
          {data.blocksScanned} blocks
        </p>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="label-sm" style={{ color: "var(--fg-muted)" }}>
          Top {data.suspiciousSells.length} suspicious sells · live scan
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="text-[10px] font-mono"
            style={{ color: "var(--fg-dim)", letterSpacing: "0.05em" }}
          >
            {data.totalEventsSeen.toLocaleString()} events scanned
          </span>
          <span
            className="text-[10px] px-2 py-1 rounded-full font-mono"
            style={{
              background: "rgba(239,68,68,0.15)",
              color: "var(--danger)",
              letterSpacing: "0.05em",
            }}
          >
            {data.suspiciousSells.length} FLAGGED
          </span>
        </div>
      </div>

      <div className="space-y-2">
        {data.suspiciousSells.map((sell) => (
          <SellRow key={sell.id} sell={sell} />
        ))}
      </div>
    </div>
  );
}

function SellRow({ sell }: { sell: SuspiciousSell }) {
  const sev = sell.severity;
  const sevColor =
    sev >= 80
      ? "var(--danger)"
      : sev >= 50
      ? "var(--warning, #f59e0b)"
      : "var(--accent-soft)";
  const sevLabel = sev >= 80 ? "CRITICAL" : sev >= 50 ? "HIGH" : "MEDIUM";

  const sellerDisplay = sell.sellerLabel ?? shorten(sell.sellerAddress);

  return (
    <div
      className="p-3 rounded-lg"
      style={{
        background: "var(--bg-elevated)",
        borderLeft: `3px solid ${sevColor}`,
      }}
    >
      {/* Top row: severity + symbol + chain + USD + impact */}
      <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="font-mono px-2 py-1 rounded"
            style={{
              background: "var(--bg-subtle)",
              color: sevColor,
              border: `1px solid ${sevColor}`,
              fontSize: "10px",
              fontWeight: 600,
              letterSpacing: "0.06em",
            }}
          >
            {sevLabel} · {sev}
          </span>
          <span
            className="font-mono px-1.5 py-0.5 rounded"
            style={{
              background: "var(--bg-subtle)",
              color: "var(--accent-soft)",
              fontSize: "11px",
              letterSpacing: "0.05em",
            }}
            title={sell.tokenName}
          >
            {sell.symbol}
          </span>
          <span
            className="text-[10px] font-mono"
            style={{ color: "var(--fg-dim)" }}
          >
            {sell.chain} · {sell.poolLabel}
          </span>
        </div>
        <div className="text-right">
          <div
            className="font-mono font-medium"
            style={{ fontSize: "14px", color: "var(--danger)" }}
          >
            {sell.amountUsd !== null ? `−${formatUsd(sell.amountUsd)}` : "—"}
          </div>
          <div className="text-[10px]" style={{ color: "var(--danger)" }}>
            {sell.poolImpactPct.toFixed(2)}% pool impact
          </div>
        </div>
      </div>

      {/* Risk-reason badges */}
      {sell.riskReasons.length > 0 && (
        <div className="flex items-center gap-1 mb-2 flex-wrap">
          {sell.riskReasons.map((r) => (
            <RiskBadge key={r} reason={r} />
          ))}
        </div>
      )}

      {/* Plain-English summary */}
      <p
        className="text-[12px] mb-2 leading-snug"
        style={{ color: "var(--fg-muted)" }}
      >
        {sell.riskSummary}
      </p>

      {/* Detail rows */}
      <div className="space-y-1 text-[11px]">
        <div className="flex items-center gap-2">
          <span style={{ color: "var(--fg-dim)", minWidth: "60px" }}>
            Seller:
          </span>
          <a
            href={sell.sellerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono hover:underline truncate"
            style={{ color: "var(--info)" }}
            title={`${sell.sellerAddress} · view on block explorer`}
          >
            {sellerDisplay}
          </a>
        </div>
        <div className="flex items-center gap-2">
          <span style={{ color: "var(--fg-dim)", minWidth: "60px" }}>
            Pool:
          </span>
          <a
            href={sell.poolUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono hover:underline truncate"
            style={{ color: "var(--fg-muted)" }}
            title={sell.poolAddress}
          >
            {shorten(sell.poolAddress)}
          </a>
        </div>
        <div className="flex items-center gap-2">
          <span style={{ color: "var(--fg-dim)", minWidth: "60px" }}>
            Amount:
          </span>
          <span className="font-mono" style={{ color: "var(--fg-muted)" }}>
            {sell.tokenAmount.toLocaleString(undefined, {
              maximumFractionDigits: 2,
            })}{" "}
            {sell.symbol}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 pt-1">
          <a
            href={sell.txUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono hover:underline"
            style={{ color: "var(--accent-soft)", fontSize: "10px" }}
          >
            view tx →
          </a>
          <span
            className="font-mono"
            style={{ color: "var(--fg-dim)", fontSize: "10px" }}
          >
            block {sell.blockNumber.toLocaleString()} · {timeAgo(sell.timestamp)}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Risk-reason badge presentation
   ───────────────────────────────────────────────────────────── */

function RiskBadge({ reason }: { reason: RiskReason }) {
  const meta = RISK_META[reason];
  return (
    <span
      className="font-mono px-1.5 py-0.5 rounded"
      style={{
        background: meta.bg,
        color: meta.fg,
        border: `1px solid ${meta.fg}`,
        fontSize: "9px",
        fontWeight: 600,
        letterSpacing: "0.06em",
      }}
      title={meta.desc}
    >
      {meta.label}
    </span>
  );
}

const RISK_META: Record<
  RiskReason,
  { label: string; bg: string; fg: string; desc: string }
> = {
  large_sell: {
    label: "LARGE SELL",
    bg: "rgba(245,158,11,0.12)",
    fg: "var(--warning, #f59e0b)",
    desc: "Sell amount over $50K USD",
  },
  liquidity_drain: {
    label: "LIQUIDITY DRAIN",
    bg: "rgba(239,68,68,0.12)",
    fg: "var(--danger)",
    desc: "Single swap consumed 10%+ of pool reserves",
  },
  abnormal_swap: {
    label: "ABNORMAL SWAP",
    bg: "rgba(239,68,68,0.18)",
    fg: "var(--danger)",
    desc: "Swap consumed 25%+ of pool — extreme size",
  },
  high_slippage: {
    label: "HIGH SLIPPAGE",
    bg: "rgba(245,158,11,0.12)",
    fg: "var(--warning, #f59e0b)",
    desc: "Implied price impact above 5%",
  },
  flash_loan_pattern: {
    label: "FLASH LOAN",
    bg: "rgba(168,85,247,0.15)",
    fg: "#a855f7",
    desc: "Same-block borrow + sell + repay pattern",
  },
  suspicious_wallet: {
    label: "SUSPICIOUS WALLET",
    bg: "rgba(245,158,11,0.12)",
    fg: "var(--warning, #f59e0b)",
    desc: "Sender matches a labeled wallet of interest",
  },
  mev_bot: {
    label: "MEV BOT",
    bg: "rgba(245,158,11,0.15)",
    fg: "var(--warning, #f59e0b)",
    desc: "Sender is a known MEV/sandwich/arbitrage operator",
  },
  new_token: {
    label: "NEW TOKEN",
    bg: "rgba(108,99,255,0.15)",
    fg: "var(--accent-soft)",
    desc: "Token has no public price — likely freshly deployed",
  },
};

function shorten(addr: string): string {
  if (!addr) return "—";
  if (addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
