type CheckResult = {
  safe: boolean;
  risk: string;
  message: string;
  scoreImpact: number;
};

export function calculateRiskScore(
  checks: CheckResult[]
) {
  let baseScore = 10;

  for (const check of checks) {
    baseScore -= check.scoreImpact;
  }

  if (baseScore < 1) {
    baseScore = 1;
  }

  let label = "SAFE";

  if (baseScore <= 7) {
    label = "WARNING";
  }

  if (baseScore <= 4) {
    label = "HIGH RISK";
  }

  return {
    score: Number(baseScore.toFixed(1)),
    label,
    checks,
  };
}