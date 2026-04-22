/* ─────────────────────────────────────────────────────────────
   AI Rug Pull Prediction (heuristic).
   Kept the original weightings but typed the output so
   downstream code never crashes on missing fields.
   ───────────────────────────────────────────────────────────── */

import type { SeverityLabel } from "./types";

export interface RugPrediction {
  rugProbability: number; // 0-100
  label: SeverityLabel;
}

export function predictRugPull(
  riskScore: number,
  holderPercent: number,
  liquidityLocked: boolean,
  ownerPrivileges: boolean,
  honeypotSignals: boolean,
): RugPrediction {
  let p = 10;

  if (holderPercent > 30) p += 20;
  if (!liquidityLocked) p += 25;
  if (ownerPrivileges) p += 15;
  if (honeypotSignals) p += 20;

  p += riskScore * 2;
  p = Math.max(0, Math.min(p, 100));

  let label: SeverityLabel = "Low";
  if (p >= 70) label = "Critical";
  else if (p >= 50) label = "High";
  else if (p >= 30) label = "Medium";

  return { rugProbability: p, label };
}
