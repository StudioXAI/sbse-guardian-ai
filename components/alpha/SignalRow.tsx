"use client";

import type { Signal } from "@/lib/alpha/types";
import { timeAgo } from "@/lib/alpha/format";
import DirectionBadge, { directionFillVar } from "./DirectionBadge";

interface Props {
  signal: Signal;
}

export default function SignalRow({ signal }: Props) {
  const fillVar = directionFillVar(signal.direction);
  const borderColor =
    signal.direction === "bullish"
      ? "var(--success)"
      : signal.direction === "bearish"
      ? "var(--danger)"
      : "var(--accent)";

  return (
    <div
      className="flex gap-3 p-3 rounded-lg mb-2 anim-fade-up"
      style={{
        background: "var(--bg-elevated)",
        borderLeft: `3px solid ${borderColor}`,
      }}
    >
      <div className="flex-shrink-0">
        <DirectionBadge direction={signal.direction} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-start gap-2 mb-1">
          <span
            className="label-xs"
            style={{ color: "var(--fg-muted)", letterSpacing: "0.08em" }}
          >
            {signal.source}
            {signal.asset ? ` · ${signal.asset}` : ""}
          </span>
          <span
            className="font-mono text-[10px] flex-shrink-0"
            style={{ color: "var(--fg-dim)" }}
          >
            {timeAgo(signal.timestamp).toUpperCase()}
          </span>
        </div>

        <p className="text-[13px] leading-snug" style={{ color: "var(--fg)" }}>
          {signal.text}
        </p>

        <div className="flex items-center gap-2 mt-2">
          <div
            className="flex-1 h-[2px] rounded-full"
            style={{ background: "var(--border)" }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${signal.score}%`,
                background: fillVar,
                boxShadow: `0 0 8px ${
                  signal.direction === "bullish"
                    ? "rgba(74,222,128,0.5)"
                    : signal.direction === "bearish"
                    ? "rgba(248,113,113,0.5)"
                    : "rgba(108,99,255,0.4)"
                }`,
              }}
            />
          </div>
          <span
            className="font-mono text-[11px] font-medium"
            style={{ color: fillVar, minWidth: "24px", textAlign: "right" }}
          >
            {signal.score}
          </span>
        </div>
      </div>
    </div>
  );
}
