/* ─────────────────────────────────────────────────────────────
   Professional report text builder.
   Used in the `professionalReport` string returned by the API.
   ───────────────────────────────────────────────────────────── */

import type { ProfessionalScore } from "./riskScore";

export function buildSecurityReport(report: ProfessionalScore): string {
  const safe: string[] = [];
  const warning: string[] = [];
  const danger: string[] = [];

  for (const check of report.checks) {
    if (check.risk === "LOW" && check.safe) safe.push(`- ${check.message}`);
    else if (check.risk === "MEDIUM" || check.risk === "UNKNOWN")
      warning.push(`- ${check.message}`);
    else danger.push(`- ${check.message}`);
  }

  const section = (title: string, items: string[]) =>
    `${title}\n${items.length ? items.join("\n") : "None"}`;

  return [
    `RISK SCORE: ${report.score} / 10`,
    `STATUS: ${report.label}`,
    "",
    section("SAFE", safe),
    "",
    section("WARNING", warning),
    "",
    section("HIGH RISK", danger),
  ].join("\n");
}
