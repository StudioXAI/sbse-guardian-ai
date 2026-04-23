/* ─────────────────────────────────────────────────────────────
   Claude AI Analyst — Batch 5B

   Two functions:
   - generateAiSummary: short 3-paragraph summary for free tier
   - generateDeepWalkthrough: expanded premium analysis with per-section
     deep dives. Only called for premium unlocked reports.

   Both cache per (contract, chainId) for 24h to minimize cost.
   ───────────────────────────────────────────────────────────── */

import { debug } from "./constants";
import type { AuditReport } from "./types";

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface AiSummary {
  verdict: string;
  paragraphs: string[];
  bottomLine: string;
}

export interface DeepWalkthrough {
  executiveSummary: string;
  sections: Array<{ heading: string; body: string }>;
  redFlags: string[];
  greenFlags: string[];
  recommendation: string;
}

interface CacheEntry<T> {
  at: number;
  data: T;
}

const summaryCache = new Map<string, CacheEntry<AiSummary>>();
const walkthroughCache = new Map<string, CacheEntry<DeepWalkthrough>>();

const SYSTEM_PROMPT_SHORT = `You are a security analyst for SbSe Guardian, a smart contract risk scanner used by retail crypto users.

Your job: translate technical audit findings into plain English that a non-technical crypto user can understand.

RULES:
- Write at a 12th-grade reading level. No jargon unless explained inline.
- Be honest about risks AND strengths. Don't catastrophize. Don't reassure.
- NEVER say "safe to invest" or "good investment" or recommend actions.
- NEVER predict price movements.
- Hedge when confidence is low: "appears to", "based on available data", etc.
- If the contract is a known stablecoin or bluechip, acknowledge that clearly.
- If findings reveal dangerous patterns, say so directly in simple words.

OUTPUT FORMAT (strict JSON only, no markdown, no prose before/after):
{
  "verdict": "<one short sentence — the headline for the AI section, 5-10 words>",
  "paragraphs": [
    "<paragraph 1: what this token actually is, 2-3 sentences>",
    "<paragraph 2: the most important risk or strength, 2-3 sentences>",
    "<paragraph 3: a second notable risk or context, 2-3 sentences>"
  ],
  "bottomLine": "<one-sentence summary starting with 'Bottom line:' — 15-25 words max>"
}

Use **asterisks** around key phrases to highlight them. Keep paragraphs tight.`;

const SYSTEM_PROMPT_DEEP = `You are a senior smart contract security analyst producing a premium report for SbSe Guardian customers who paid for deeper analysis.

Your job: a thorough, accessible walkthrough of what this contract actually does, who controls it, and what could go wrong. Longer than the free summary but still plain English.

RULES:
- 12th-grade reading level. Explain technical terms inline on first use.
- Be specific — reference actual findings from the report, don't generalize.
- NEVER recommend buying, selling, or holding. NEVER predict price.
- Honest about both risks AND strengths.
- If ownership renounced: say what that actually means for the user.
- If proxy: explain what an upgrade would mean for the user.
- If mint/blacklist/pause: explain the real-world implication.
- End with a neutral "what to consider" — never "buy/sell/hold".

OUTPUT FORMAT (strict JSON only, no markdown, no prose around JSON):
{
  "executiveSummary": "<3-4 sentence top-level summary>",
  "sections": [
    { "heading": "<short heading>", "body": "<3-5 sentence plain English>" },
    { "heading": "<short heading>", "body": "<3-5 sentence plain English>" },
    { "heading": "<short heading>", "body": "<3-5 sentence plain English>" },
    { "heading": "<short heading>", "body": "<3-5 sentence plain English>" }
  ],
  "redFlags": ["<concise red flag>", "<concise red flag>"],
  "greenFlags": ["<concise positive>", "<concise positive>"],
  "recommendation": "<1-2 sentences starting 'What to consider:' — neutral, non-directive>"
}

Sections should cover: (1) What this contract is, (2) Who controls it and how, (3) Key risks, (4) Trading considerations. Exactly 4 sections.`;

function summaryKey(addr: string, chainId: string): string {
  return `${chainId}:${addr.toLowerCase()}`;
}

function buildInputContext(report: AuditReport): string {
  const findings = report.findings
    .map((f) => `[${f.severity.toUpperCase()}] ${f.label}${f.detail ? ` — ${f.detail}` : ""}`)
    .join("\n");

  const layers = report.layerScores
    .map((l) => `${l.label}: ${l.score}/10 (${l.summary})`)
    .join("\n");

  return `CONTRACT: ${report.contractAddress}
CHAIN: ${report.chain}
PROJECT: ${report.project}
TOKEN TYPE: ${report.tokenType}
VERIFIED SOURCE: ${report.verified}
COMPILER: ${report.compilerVersion || "unknown"}

COMPUTED SCORES:
- Risk Score: ${report.riskScore}/10 (1 = safest)
- Professional Score: ${report.professionalScore}/10 (10 = safest)
- Grade: ${report.grade}
- Rug Probability: ${report.rugPullProbability}% (${report.rugPullRisk})
- Confidence: ${report.confidence}% (how much data we got)

CURRENT VERDICT: ${report.verdict.label} — ${report.verdict.headline}

SECURITY LAYERS:
${layers}

ALL FINDINGS:
${findings}`;
}

function extractJson<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return null;
    }
  }
}

function isValidSummary(obj: unknown): obj is AiSummary {
  if (!obj || typeof obj !== "object") return false;
  const s = obj as Record<string, unknown>;
  return (
    typeof s.verdict === "string" &&
    Array.isArray(s.paragraphs) &&
    s.paragraphs.length > 0 &&
    s.paragraphs.every((p) => typeof p === "string") &&
    typeof s.bottomLine === "string"
  );
}

function isValidWalkthrough(obj: unknown): obj is DeepWalkthrough {
  if (!obj || typeof obj !== "object") return false;
  const s = obj as Record<string, unknown>;
  return (
    typeof s.executiveSummary === "string" &&
    Array.isArray(s.sections) &&
    s.sections.every(
      (sec: any) => typeof sec?.heading === "string" && typeof sec?.body === "string",
    ) &&
    Array.isArray(s.redFlags) &&
    Array.isArray(s.greenFlags) &&
    typeof s.recommendation === "string"
  );
}

async function callClaude<T>(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  validator: (obj: unknown) => obj is T,
): Promise<T | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    debug("ANTHROPIC_API_KEY not set");
    return null;
  }

  try {
    const res = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        temperature: 0.3,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      debug("Anthropic API error:", res.status);
      return null;
    }

    const data = await res.json();
    const text = data?.content?.[0]?.text;
    if (!text || typeof text !== "string") return null;

    const parsed = extractJson<T>(text);
    if (!parsed || !validator(parsed)) {
      debug("Invalid AI response shape");
      return null;
    }
    return parsed;
  } catch (e) {
    debug("AI call failed:", e);
    return null;
  }
}

/* ─── Public API ─── */

export async function generateAiSummary(
  report: AuditReport,
): Promise<AiSummary | null> {
  const key = summaryKey(report.contractAddress, report.chainId);
  const cached = summaryCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;

  const summary = await callClaude<AiSummary>(
    SYSTEM_PROMPT_SHORT,
    buildInputContext(report),
    800,
    isValidSummary,
  );
  if (!summary) return null;

  summary.paragraphs = summary.paragraphs.slice(0, 4);
  if (summary.bottomLine.length > 300) {
    summary.bottomLine = summary.bottomLine.slice(0, 297) + "...";
  }

  summaryCache.set(key, { at: Date.now(), data: summary });
  if (summaryCache.size > 500) {
    const now = Date.now();
    for (const [k, v] of summaryCache) {
      if (now - v.at > CACHE_TTL_MS) summaryCache.delete(k);
    }
  }
  return summary;
}

export async function generateDeepWalkthrough(
  report: AuditReport,
): Promise<DeepWalkthrough | null> {
  const key = summaryKey(report.contractAddress, report.chainId);
  const cached = walkthroughCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;

  const walkthrough = await callClaude<DeepWalkthrough>(
    SYSTEM_PROMPT_DEEP,
    buildInputContext(report),
    2000,
    isValidWalkthrough,
  );
  if (!walkthrough) return null;

  walkthrough.sections = walkthrough.sections.slice(0, 6);
  walkthrough.redFlags = walkthrough.redFlags.slice(0, 8);
  walkthrough.greenFlags = walkthrough.greenFlags.slice(0, 8);

  walkthroughCache.set(key, { at: Date.now(), data: walkthrough });
  if (walkthroughCache.size > 200) {
    const now = Date.now();
    for (const [k, v] of walkthroughCache) {
      if (now - v.at > CACHE_TTL_MS) walkthroughCache.delete(k);
    }
  }
  return walkthrough;
}
