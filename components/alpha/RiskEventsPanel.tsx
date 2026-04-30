"use client";

import type { ThreatsPayload, RiskEvent } from "@/lib/alpha/threatTracker";
import { timeAgo } from "@/lib/alpha/format";

interface Props {
  data: ThreatsPayload | null;
}

export default function RiskEventsPanel({ data }: Props) {
  if (data === null) {
    return (
      <div className="card p-5">
        <div className="text-sm" style={{ color: "var(--fg-dim)" }}>
          Decoding risk events from monitored token contracts…
        </div>
      </div>
    );
  }

  if (data.unconfigured) return null;

  if (data.riskEvents.length === 0) {
    return (
      <div className="card p-5">
        <div
          className="font-mono text-[11px] mb-2"
          style={{ color: "var(--fg-dim)", letterSpacing: "0.05em" }}
        >
          NO RISK EVENTS IN THE LAST 6 HOURS
        </div>
        <p className="text-[13px]" style={{ color: "var(--fg-muted)" }}>
          No calls to dangerous functions (mint, transferOwnership,
          removeLiquidity, upgradeTo, etc.) have been detected on monitored
          token contracts. The scanner refreshes every 90 seconds.
        </p>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="label-sm" style={{ color: "var(--fg-muted)" }}>
          Decoded risk events · sorted by severity
        </div>
        <span
          className="text-[10px] px-2 py-1 rounded-full font-mono"
          style={{
            background: "rgba(245,158,11,0.15)",
            color: "var(--warning, #f59e0b)",
            letterSpacing: "0.05em",
          }}
        >
          {data.riskEvents.length} FLAGGED
        </span>
      </div>

      <div className="space-y-2">
        {data.riskEvents.map((event) => (
          <EventRow key={event.id} event={event} />
        ))}
      </div>
    </div>
  );
}

function EventRow({ event }: { event: RiskEvent }) {
  const sevColor =
    event.severity === "critical"
      ? "var(--danger)"
      : event.severity === "high"
      ? "var(--warning, #f59e0b)"
      : event.severity === "medium"
      ? "var(--accent-soft)"
      : "var(--fg-muted)";

  const callerDisplay = event.callerLabel ?? shorten(event.callerAddress);
  const targetDisplay = event.targetLabel ?? shorten(event.targetAddress);

  return (
    <div
      className="p-3 rounded-lg"
      style={{
        background: "var(--bg-elevated)",
        borderLeft: `3px solid ${sevColor}`,
      }}
    >
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
            {event.severity.toUpperCase()}
          </span>
          <span
            className="font-mono px-2 py-1 rounded"
            style={{
              background: "var(--bg-subtle)",
              color: "var(--fg)",
              fontSize: "11px",
              fontWeight: 500,
              letterSpacing: "0.04em",
            }}
          >
            {event.functionName}()
          </span>
          {event.symbol && (
            <span
              className="font-mono px-1.5 py-0.5 rounded"
              style={{
                background: "var(--bg-subtle)",
                color: "var(--accent-soft)",
                fontSize: "10px",
                letterSpacing: "0.05em",
              }}
            >
              {event.symbol}
            </span>
          )}
          <span
            className="text-[10px] font-mono"
            style={{ color: "var(--fg-dim)" }}
          >
            {event.chain}
          </span>
        </div>
        <span
          className="font-mono"
          style={{ color: "var(--fg-dim)", fontSize: "10px" }}
        >
          {timeAgo(event.timestamp)}
        </span>
      </div>

      <p
        className="text-[12px] mb-2 leading-snug"
        style={{ color: "var(--fg-muted)" }}
      >
        {event.description}
      </p>

      <div className="space-y-1 text-[11px]">
        <div className="flex items-center gap-2">
          <span style={{ color: "var(--fg-dim)", minWidth: "60px" }}>
            Caller:
          </span>
          <a
            href={event.callerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono hover:underline truncate"
            style={{ color: "var(--info)" }}
            title={event.callerAddress}
          >
            {callerDisplay}
          </a>
        </div>
        <div className="flex items-center gap-2">
          <span style={{ color: "var(--fg-dim)", minWidth: "60px" }}>
            Target:
          </span>
          <a
            href={event.targetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono hover:underline truncate"
            style={{ color: "var(--info)" }}
            title={event.targetAddress}
          >
            {targetDisplay}
          </a>
        </div>
        <div className="flex items-center justify-between gap-2 pt-1">
          <a
            href={event.txUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono hover:underline"
            style={{ color: "var(--accent-soft)", fontSize: "10px" }}
          >
            view tx →
          </a>
          <span
            className="font-mono"
            style={{ color: "var(--fg-dim)", fontSize: "9px" }}
          >
            {event.signature}
          </span>
        </div>
      </div>
    </div>
  );
}

function shorten(addr: string): string {
  if (!addr) return "—";
  if (addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
