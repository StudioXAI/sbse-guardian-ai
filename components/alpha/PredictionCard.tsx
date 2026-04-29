"use client";

import type { AssetPrediction } from "@/lib/alpha/types";
import { directionFillVar } from "./DirectionBadge";

interface Props {
  prediction: AssetPrediction;
}

export default function PredictionCard({ prediction }: Props) {
  const fill = directionFillVar(prediction.direction);
  const borderTop =
    prediction.direction === "bullish"
      ? "var(--success)"
      : prediction.direction === "bearish"
      ? "var(--danger)"
      : "var(--accent)";

  /* Round confidence to nearest 5 for stable display. Tiny ticks like
     67→68→67 caused by minor signal jitter feel "jumping" to users.
     Snapping to nearest 5 means the value only changes when the
     underlying signals shifted by something meaningful. */
  const stableConfidence = Math.round(prediction.confidence / 5) * 5;
  const directionLabel = prediction.direction.toUpperCase();

  return (
    <div
      className="card p-4"
      style={{
        borderTop: `2px solid ${borderTop}`,
        borderTopLeftRadius: 0,
        borderTopRightRadius: 0,
      }}
    >
      <div
        className="label-xs"
        style={{ color: "var(--fg-dim)", marginBottom: "8px" }}
      >
        {prediction.asset}
      </div>

      <div
        className="font-medium tracking-tight"
        style={{
          fontSize: "18px",
          color: fill,
          textShadow: `0 0 16px ${
            prediction.direction === "bullish"
              ? "rgba(74,222,128,0.35)"
              : prediction.direction === "bearish"
              ? "rgba(248,113,113,0.35)"
              : "rgba(108,99,255,0.35)"
          }`,
          lineHeight: 1.1,
        }}
      >
        {directionLabel}
      </div>

      {prediction.target && (
        <div
          className="font-mono mt-1"
          style={{ fontSize: "11px", color: "var(--fg-muted)" }}
        >
          {prediction.target}
        </div>
      )}

      <div className="flex items-center gap-2 mt-3">
        <div
          className="flex-1 h-[3px] rounded-full"
          style={{ background: "var(--border)" }}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${stableConfidence}%`,
              background: fill,
            }}
          />
        </div>
        <span
          className="font-mono text-[10px]"
          style={{ color: "var(--fg-dim)" }}
        >
          {stableConfidence}%
        </span>
      </div>

      {prediction.reason && (
        <p
          className="mt-2 text-[11px] leading-snug"
          style={{ color: "var(--fg-muted)" }}
        >
          {prediction.reason}
        </p>
      )}
    </div>
  );
}
