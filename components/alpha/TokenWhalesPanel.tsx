"use client";

import { useMemo } from "react";
import type {
  TokenWhalesPayload,
  TokenTrade,
} from "@/lib/alpha/tokenWhaleTracker";
import { formatUsd, timeAgo } from "@/lib/alpha/format";

const HOUR_MS = 60 * 60 * 1000;

interface Props {
  data: TokenWhalesPayload | null;
}

export default function TokenWhalesPanel({ data }: Props) {
  /* Stats across both sides — must be unconditional per rules-of-hooks. */
  const stats = useMemo(() => {
    if (!data) {
      return {
        totalBuys: 0,
        totalSells: 0,
        biggestBuy: 0,
        biggestSell: 0,
        chains: 0,
      };
    }
    let totalBuys = 0;
    let totalSells = 0;
    let biggestBuy = 0;
    let biggestSell = 0;
    const chainSet = new Set<string>();
    for (const t of data.buys) {
      totalBuys += t.amountUsd;
      if (t.amountUsd > biggestBuy) biggestBuy = t.amountUsd;
      chainSet.add(t.chain);
    }
    for (const t of data.sells) {
      totalSells += t.amountUsd;
      if (t.amountUsd > biggestSell) biggestSell = t.amountUsd;
      chainSet.add(t.chain);
    }
    return {
      totalBuys,
      totalSells,
      biggestBuy,
      biggestSell,
      chains: chainSet.size,
    };
  }, [data]);

  /* Loading */
  if (data === null) {
    return (
      <div className="card p-5">
        <div className="text-sm" style={{ color: "var(--fg-dim)" }}>
          Scanning token transfers across 6 chains…
        </div>
      </div>
    );
  }

  /* Empty state */
  if (data.buys.length === 0 && data.sells.length === 0) {
    return (
      <>
        <Header />
        <div className="card p-5">
          <div
            className="font-mono text-[11px] mb-2"
            style={{ color: "var(--fg-dim)", letterSpacing: "0.05em" }}
          >
            NO $50K+ TOKEN MOVES IN THE LAST 24 HOURS
          </div>
          <p className="text-[13px]" style={{ color: "var(--fg-muted)" }}>
            Either token markets are quiet or our scan hasn't picked anything
            up yet. The feed refreshes every 90 seconds. Try again in a moment.
          </p>
        </div>
      </>
    );
  }

  /* Split each side into recent (≤6h) and older (6-24h) */
  const splitBuys = splitByAge(data.buys);
  const splitSells = splitByAge(data.sells);

  return (
    <div className="space-y-5">
      <Header />

      {/* Stats strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Total buys (24h)"
          value={formatUsd(stats.totalBuys)}
          colorVar="var(--success)"
        />
        <StatCard
          label="Total sells (24h)"
          value={formatUsd(stats.totalSells)}
          colorVar="var(--danger)"
        />
        <StatCard label="Biggest buy" value={formatUsd(stats.biggestBuy)} />
        <StatCard label="Biggest sell" value={formatUsd(stats.biggestSell)} />
      </div>

      {/* Two-column layout */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* BUYS column */}
        <div className="card p-5" style={{ borderLeft: "3px solid var(--success)" }}>
          <div className="flex items-center justify-between mb-4">
            <div className="label-sm" style={{ color: "var(--fg-muted)" }}>
              Biggest buys
            </div>
            <span
              className="text-[10px] px-2 py-1 rounded-full font-mono"
              style={{
                background: "rgba(16,185,129,0.15)",
                color: "var(--success)",
                letterSpacing: "0.05em",
              }}
            >
              {data.buys.length} TRADES
            </span>
          </div>

          {/* Recent buys */}
          <div className="mb-4">
            <div
              className="text-[10px] mb-2 font-mono"
              style={{ color: "var(--fg-dim)", letterSpacing: "0.05em" }}
            >
              LAST 6 HOURS
            </div>
            {splitBuys.recent.length === 0 ? (
              <EmptyMini text="No buys in the last 6 hours" />
            ) : (
              <div className="space-y-2">
                {splitBuys.recent.map((t) => (
                  <TradeRow key={t.id} trade={t} />
                ))}
              </div>
            )}
          </div>

          {/* Past buys (6-24h) */}
          {splitBuys.older.length > 0 && (
            <div>
              <div
                className="text-[10px] mb-2 font-mono"
                style={{ color: "var(--fg-dim)", letterSpacing: "0.05em" }}
              >
                PAST · 6–24 HOURS AGO
              </div>
              <div className="space-y-2">
                {splitBuys.older.map((t) => (
                  <TradeRow key={t.id} trade={t} faded />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* SELLS column */}
        <div className="card p-5" style={{ borderLeft: "3px solid var(--danger)" }}>
          <div className="flex items-center justify-between mb-4">
            <div className="label-sm" style={{ color: "var(--fg-muted)" }}>
              Biggest sells
            </div>
            <span
              className="text-[10px] px-2 py-1 rounded-full font-mono"
              style={{
                background: "rgba(239,68,68,0.15)",
                color: "var(--danger)",
                letterSpacing: "0.05em",
              }}
            >
              {data.sells.length} TRADES
            </span>
          </div>

          <div className="mb-4">
            <div
              className="text-[10px] mb-2 font-mono"
              style={{ color: "var(--fg-dim)", letterSpacing: "0.05em" }}
            >
              LAST 6 HOURS
            </div>
            {splitSells.recent.length === 0 ? (
              <EmptyMini text="No sells in the last 6 hours" />
            ) : (
              <div className="space-y-2">
                {splitSells.recent.map((t) => (
                  <TradeRow key={t.id} trade={t} />
                ))}
              </div>
            )}
          </div>

          {splitSells.older.length > 0 && (
            <div>
              <div
                className="text-[10px] mb-2 font-mono"
                style={{ color: "var(--fg-dim)", letterSpacing: "0.05em" }}
              >
                PAST · 6–24 HOURS AGO
              </div>
              <div className="space-y-2">
                {splitSells.older.map((t) => (
                  <TradeRow key={t.id} trade={t} faded />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Sub-components
   ───────────────────────────────────────────────────────────── */

function Header() {
  return (
    <div
      className="card p-4 flex items-center justify-between flex-wrap gap-3"
      style={{ borderLeft: "3px solid var(--accent)" }}
    >
      <div>
        <div className="label-xs" style={{ color: "var(--accent-soft)" }}>
          Token whale trades · $50K and above
        </div>
        <div className="text-[12px] mt-1" style={{ color: "var(--fg-muted)" }}>
          Top tokens across 6 chains · classified by DEX router and exchange
          counterparties · last 24 hours
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  colorVar = "var(--fg)",
}: {
  label: string;
  value: string;
  colorVar?: string;
}) {
  return (
    <div className="card p-3">
      <div className="label-xs" style={{ color: "var(--fg-dim)" }}>
        {label}
      </div>
      <div
        className="font-mono mt-1"
        style={{ color: colorVar, fontSize: "16px" }}
      >
        {value}
      </div>
    </div>
  );
}

function TradeRow({
  trade,
  faded = false,
}: {
  trade: TokenTrade;
  faded?: boolean;
}) {
  const isBuy = trade.side === "buy";
  const valueColor = isBuy ? "var(--success)" : "var(--danger)";
  const sign = isBuy ? "+" : "−";

  /* Display label for the whale: prefer label, else shortened address. */
  const whaleDisplay = trade.whaleLabel ?? shorten(trade.whaleAddress);

  return (
    <div
      className="p-3 rounded-lg"
      style={{
        background: "var(--bg-elevated)",
        opacity: faded ? 0.65 : 1,
      }}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span
            className="font-mono text-[10px] px-1.5 py-0.5 rounded"
            style={{
              background: "var(--bg-subtle)",
              color: "var(--accent-soft)",
              letterSpacing: "0.05em",
            }}
          >
            {trade.symbol}
          </span>
          <span
            className="text-[10px] font-mono"
            style={{ color: "var(--fg-dim)" }}
          >
            {trade.chain}
          </span>
        </div>
        <div className="text-right flex-shrink-0">
          <div
            className="font-mono font-medium"
            style={{ fontSize: "13px", color: valueColor }}
          >
            {sign}
            {formatUsd(trade.amountUsd)}
          </div>
        </div>
      </div>

      <div className="space-y-1">
        {/* Whale wallet line — clickable */}
        <div className="flex items-center gap-2 text-[11px]">
          <span style={{ color: "var(--fg-dim)" }}>
            {isBuy ? "Whale" : "Seller"}:
          </span>
          <a
            href={trade.whaleExplorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono hover:underline truncate"
            style={{ color: "var(--info)" }}
            title={`${trade.whaleAddress} · view on block explorer`}
          >
            {whaleDisplay}
          </a>
        </div>

        {/* Counterparty line */}
        <div className="flex items-center gap-2 text-[11px]">
          <span style={{ color: "var(--fg-dim)" }}>
            via {trade.counterpartyType === "dex" ? "DEX" : "CEX"}:
          </span>
          <span style={{ color: "var(--fg-muted)" }}>
            {trade.counterpartyLabel}
          </span>
        </div>

        {/* Tx + time line */}
        <div className="flex items-center justify-between gap-2 text-[10px]">
          <a
            href={trade.txExplorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono hover:underline"
            style={{ color: "var(--accent-soft)" }}
            title={`Tx ${trade.txHash}`}
          >
            view tx →
          </a>
          <span className="font-mono" style={{ color: "var(--fg-dim)" }}>
            {timeAgo(trade.timestamp)}
          </span>
        </div>
      </div>
    </div>
  );
}

function EmptyMini({ text }: { text: string }) {
  return (
    <div
      className="p-3 rounded-lg text-[12px]"
      style={{
        background: "var(--bg-subtle)",
        color: "var(--fg-dim)",
        textAlign: "center",
      }}
    >
      {text}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Helpers
   ───────────────────────────────────────────────────────────── */

function splitByAge(trades: TokenTrade[]): {
  recent: TokenTrade[];
  older: TokenTrade[];
} {
  const now = Date.now();
  const recent: TokenTrade[] = [];
  const older: TokenTrade[] = [];
  for (const t of trades) {
    if (now - t.timestamp < 6 * HOUR_MS) recent.push(t);
    else older.push(t);
  }
  return { recent, older };
}

function shorten(addr: string): string {
  if (!addr) return "—";
  if (addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
