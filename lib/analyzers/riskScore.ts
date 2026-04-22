/* ─────────────────────────────────────────────────────────────
   Professional risk score aggregator.
   Output: 1-10 where 10 = safest.
   ───────────────────────────────────────────────────────────── */

import type { CheckResult } from "./honeypotCheck";

export interface ProfessionalScore {
  score: number;
  label: "SAFE" | "WARNING" | "HIGH RISK";
  checks: CheckResult[];
}

export function calculateRiskScore(checks: CheckResult[]): ProfessionalScore {
  let baseScore = 10;
  for (const check of checks) baseScore -= check.scoreImpact;
  baseScore = Math.max(1, Math.min(10, baseScore));

  let label: ProfessionalScore["label"] = "SAFE";
  if (baseScore <= 4) label = "HIGH RISK";
  else if (baseScore <= 7) label = "WARNING";

  return { score: Number(baseScore.toFixed(1)), label, checks };
}
