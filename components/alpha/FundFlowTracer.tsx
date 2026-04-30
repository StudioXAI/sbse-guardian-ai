"use client";

import { useState } from "react";
import type { WalletTrace, TraceNode } from "@/lib/alpha/walletPathTracer";
import { alphaGet } from "@/lib/alpha/client";
import { formatUsd } from "@/lib/alpha/format";

const ADDR_REGEX = /^0x[a-fA-F0-9]{40}$/;

const CHAINS: Array<{ id: number; label: string }> = [
  { id: 1, label: "Ethereum" },
  { id: 56, label: "BSC" },
  { id: 137, label: "Polygon" },
  { id: 42161, label: "Arbitrum" },
  { id: 10, label: "Optimism" },
  { id: 8453, label: "Base" },
];

export default function FundFlowTracer() {
  const [address, setAddress] = useState("");
  const [chainId, setChainId] = useState<number>(1);
  const [trace, setTrace] = useState<WalletTrace | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runTrace() {
    setError(null);
    setTrace(null);
    if (!ADDR_REGEX.test(address.trim())) {
      setError("Enter a valid wallet address (0x followed by 40 hex characters).");
      return;
    }
    setLoading(true);
    try {
      const result = await alphaGet<WalletTrace>(
        `/api/alpha/trace?address=${address.trim()}&chainId=${chainId}`,
      );
      if (!result) {
        setError(
          "Trace failed. The wallet may have no recent activity, or the API is temporarily unavailable.",
        );
      } else {
        setTrace(result);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Trace failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <div className="label-sm mb-3" style={{ color: "var(--fg-muted)" }}>
          Trace any wallet's recent fund flow
        </div>
        <p className="text-[12px] mb-4" style={{ color: "var(--fg-dim)" }}>
          Enter a wallet address and chain. We trace the largest single path
          of inflows backward (where funds came from) and outflows forward
          (where funds went), following both native ETH and ERC20 token
          transfers. Stops at known exchanges or after 3 hops. Smaller
          branching transfers are not shown.
        </p>

        <div className="flex flex-wrap gap-2 mb-3">
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="0x... wallet address"
            className="flex-1 min-w-[260px] px-3 py-2 rounded-md font-mono text-[12px]"
            style={{
              background: "var(--bg-subtle)",
              border: "1px solid var(--border)",
              color: "var(--fg)",
              outline: "none",
            }}
          />
          <select
            value={chainId}
            onChange={(e) => setChainId(parseInt(e.target.value, 10))}
            className="px-3 py-2 rounded-md font-mono text-[11px]"
            style={{
              background: "var(--bg-subtle)",
              border: "1px solid var(--border)",
              color: "var(--fg)",
              cursor: "pointer",
            }}
          >
            {CHAINS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={runTrace}
            disabled={loading || !address.trim()}
            className="px-4 py-2 rounded-md transition-colors disabled:opacity-50"
            style={{
              background: "var(--accent)",
              color: "#fff",
              fontSize: "12px",
              fontWeight: 500,
              border: "none",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Tracing…" : "Trace wallet"}
          </button>
        </div>

        {error && (
          <p
            className="text-[12px] mt-2"
            style={{ color: "var(--danger)" }}
          >
            {error}
          </p>
        )}
      </div>

      {trace && <TraceResult trace={trace} />}
    </div>
  );
}

function TraceResult({ trace }: { trace: WalletTrace }) {
  return (
    <div className="space-y-4">
      {/* Origin card */}
      <div
        className="card p-4"
        style={{ borderLeft: "3px solid var(--accent)" }}
      >
        <div
          className="label-xs mb-2"
          style={{ color: "var(--accent-soft)" }}
        >
          Origin · {trace.chainName}
        </div>
        <div
          className="font-mono mb-2 break-all"
          style={{ fontSize: "12px", color: "var(--fg)" }}
        >
          {trace.origin}
        </div>
        <p className="text-[12px]" style={{ color: "var(--fg-muted)" }}>
          {trace.summary}
        </p>
      </div>

      {/* Two-column trace display */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* BACKWARD — inflows trace */}
        <div className="card p-4">
          <div
            className="label-xs mb-3 flex items-center gap-2"
            style={{ color: "var(--fg-muted)" }}
          >
            <span>← Source trace · backward</span>
            <span
              className="text-[9px] px-1.5 py-0.5 rounded"
              style={{
                background: "var(--bg-subtle)",
                color: "var(--fg-dim)",
              }}
            >
              {trace.backward.length} {trace.backward.length === 1 ? "hop" : "hops"}
            </span>
          </div>

          {trace.backward.length === 0 ? (
            <p className="text-[12px]" style={{ color: "var(--fg-dim)" }}>
              No significant inflows in the last 24 hours.
            </p>
          ) : (
            <div className="space-y-2">
              {trace.backward.map((node) => (
                <NodeRow key={`back-${node.hop}`} node={node} />
              ))}
            </div>
          )}
        </div>

        {/* FORWARD — outflows trace */}
        <div className="card p-4">
          <div
            className="label-xs mb-3 flex items-center gap-2"
            style={{ color: "var(--fg-muted)" }}
          >
            <span>Destination trace · forward →</span>
            <span
              className="text-[9px] px-1.5 py-0.5 rounded"
              style={{
                background: "var(--bg-subtle)",
                color: "var(--fg-dim)",
              }}
            >
              {trace.forward.length} {trace.forward.length === 1 ? "hop" : "hops"}
            </span>
          </div>

          {trace.forward.length === 0 ? (
            <p className="text-[12px]" style={{ color: "var(--fg-dim)" }}>
              No significant outflows in the last 24 hours.
            </p>
          ) : (
            <div className="space-y-2">
              {trace.forward.map((node) => (
                <NodeRow key={`fwd-${node.hop}`} node={node} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NodeRow({ node }: { node: TraceNode }) {
  const display = node.label ?? shorten(node.address);
  const categoryLabel = node.category ? node.category.toUpperCase() : null;
  const categoryColor =
    node.category === "cex"
      ? "var(--success)"
      : node.category === "mev"
      ? "var(--warning, #f59e0b)"
      : node.category === "team"
      ? "var(--info)"
      : "var(--fg-muted)";

  return (
    <div
      className="p-3 rounded-lg"
      style={{
        background: "var(--bg-elevated)",
        borderLeft: node.isTerminal
          ? "2px solid var(--success)"
          : "2px solid var(--border)",
      }}
    >
      <div className="flex items-start justify-between gap-2 flex-wrap mb-1">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span
            className="font-mono text-[10px] px-1.5 py-0.5 rounded"
            style={{
              background: "var(--bg-subtle)",
              color: "var(--fg-dim)",
              letterSpacing: "0.05em",
            }}
          >
            HOP {node.hop}
          </span>
          {categoryLabel && (
            <span
              className="font-mono text-[9px] px-1.5 py-0.5 rounded"
              style={{
                background: "var(--bg-subtle)",
                color: categoryColor,
                border: `1px solid ${categoryColor}`,
                letterSpacing: "0.06em",
              }}
            >
              {categoryLabel}
            </span>
          )}
          {node.isTerminal && (
            <span
              className="font-mono text-[9px] px-1.5 py-0.5 rounded"
              style={{
                background: "rgba(16,185,129,0.15)",
                color: "var(--success)",
                letterSpacing: "0.05em",
              }}
            >
              TERMINAL
            </span>
          )}
        </div>
        <div className="text-right text-[11px]">
          <div className="font-mono" style={{ color: "var(--fg)" }}>
            {node.flowDescription ??
              (node.nativeAmount > 0
                ? `${node.nativeAmount.toFixed(3)} native`
                : "—")}
          </div>
          <div className="text-[10px]" style={{ color: "var(--fg-dim)" }}>
            ~{formatUsd(node.approxUsd)}
          </div>
        </div>
      </div>
      <a
        href={node.explorerUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono text-[11px] hover:underline truncate block"
        style={{ color: "var(--info)" }}
        title={node.address}
      >
        {display}
      </a>
    </div>
  );
}

function shorten(addr: string): string {
  if (!addr) return "—";
  if (addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
