/* ─────────────────────────────────────────────────────────────
   Shared types — one contract between API and UI.
   Prevents the `professionalScore.score` vs number crash.
   ───────────────────────────────────────────────────────────── */

export type SeverityLabel =
  | "Very Safe"
  | "Low"
  | "Moderate"
  | "Medium"
  | "High"
  | "Critical";

export type GradeLetter = "A+" | "A" | "B" | "C" | "D" | "F";

export interface AuditReport {
  success: true;
  isSbSeVerified: boolean;
  project: string;
  contractAddress: string;
  chain: string;
  chainId: string;
  chainIdNum: number;
  nativeToken: string;

  compilerVersion?: string;
  verified: boolean;
  tokenType: string;

  /** Risk 1–10 (1 = safest). */
  riskScore: number;
  /** Professional analyzer 1–10 (10 = safest). */
  professionalScore: number;
  professionalLabel: string;
  professionalReport: string;

  rugPullProbability: number;
  rugPullRisk: SeverityLabel | string;

  /** A-F letter grade derived from riskScore. */
  grade: GradeLetter;

  /** Overall verdict — the single answer the user cares about. */
  verdict: {
    label: "SAFE" | "CAUTION" | "HIGH RISK" | "INSTITUTIONAL";
    headline: string;
    plainEnglish: string;
  };

  /** 0–100 — how confident we are given data-source coverage. */
  confidence: number;

  sbseScore: string | number;

  findings: Finding[];
  layerScores: LayerScore[];

  website?: string | null;
  marketCap?: string;

  beginnerExplanation: string;
  scannedAt: string;
}

export interface Finding {
  label: string;
  severity: "info" | "good" | "warn" | "bad";
  detail?: string;
}

export interface LayerScore {
  id: string;
  label: string;
  score: number; // 0–10
  summary: string;
}

export type AuditApiResponse =
  | AuditReport
  | { success: false; message: string };
