type CheckResult = {
  safe: boolean;
  risk: string;
  message: string;
  scoreImpact: number;
};

type FinalReport = {
  score: number;
  label: string;
  checks: CheckResult[];
};

export function buildSecurityReport(
  report: FinalReport
) {
  const safeItems: string[] = [];
  const warningItems: string[] = [];
  const dangerItems: string[] = [];

  for (const check of report.checks) {
    if (check.risk === "LOW" && check.safe) {
      safeItems.push(`✓ ${check.message}`);
    } else if (
      check.risk === "MEDIUM" ||
      check.risk === "UNKNOWN"
    ) {
      warningItems.push(`⚠ ${check.message}`);
    } else {
      dangerItems.push(`✗ ${check.message}`);
    }
  }

  return `
RISK SCORE: ${report.score} / 10
STATUS: ${report.label}

========================

SAFE
${safeItems.length ? safeItems.join("\n") : "None"}

========================

WARNING
${
  warningItems.length
    ? warningItems.join("\n")
    : "None"
}

========================

HIGH RISK
${
  dangerItems.length
    ? dangerItems.join("\n")
    : "None"
}
`;
}