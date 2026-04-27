"use client";

import type { Direction } from "@/lib/alpha/types";

const STYLES: Record<Direction, { bg: string; color: string; border: string; label: string }> = {
  bullish: {
    bg: "var(--success-dim)",
    color: "var(--success)",
    border: "rgba(74,222,128,0.3)",
    label: "BULLISH",
  },
  bearish: {
    bg: "var(--danger-dim)",
    color: "var(--danger)",
    border: "rgba(248,113,113,0.3)",
    label: "BEARISH",
  },
  neutral: {
    bg: "var(--accent-dim)",
    color: "var(--accent-soft)",
    border: "var(--border-accent)",
    label: "NEUTRAL",
  },
};

interface Props {
  direction: Direction;
  size?: "sm" | "md";
  customLabel?: string;
}

export default function DirectionBadge({ direction, size = "md", customLabel }: Props) {
  const s = STYLES[direction];
  const padding = size === "sm" ? "2px 7px" : "4px 9px";
  const fontSize = size === "sm" ? "9px" : "10px";

  return (
    <span
      className="inline-flex items-center justify-center rounded-md font-mono"
      style={{
        background: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
        padding,
        fontSize,
        letterSpacing: "0.06em",
        fontWeight: 500,
        minWidth: size === "sm" ? "auto" : "72px",
        textAlign: "center",
      }}
    >
      {customLabel ?? s.label}
    </span>
  );
}

export function directionColor(direction: Direction): string {
  return STYLES[direction].color;
}

export function directionFillVar(direction: Direction): string {
  if (direction === "bullish") return "var(--success)";
  if (direction === "bearish") return "var(--danger)";
  return "var(--accent)";
}
