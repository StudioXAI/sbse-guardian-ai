/* ─────────────────────────────────────────────────────────────
   Claude-powered AI Analyst
   Produces plain-English explanation from audit findings.

   Key design decisions:
   - Uses claude-haiku-4-5 (fast + cheap: ~$0.002 per scan)
   - Structured JSON output for reliable parsing
   - Fails gracefully: if API is down, returns null and UI hides the AI block
   - Caches per (contract, chainId) for 24h to save cost and latency
   - Temperature 0.3: consistent, not creative
   ───────────────────────────────────────────────────────────── */

import { debug } from "./constants";
import type { AuditReport } from "./types";

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export interface AiSummary {
  verdict: string;
  paragraphs: string[];
  bottomLine: string;
}

interface CacheEntry {
  at: number;
  data: AiSummary;
}

const cache = new Map<string, CacheEntry>();

const SYSTEM_PROMPT = `You are a security analyst for SbSe Guardian, a smart contract risk scanner used by retail crypto users.

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

function cacheKey(contractAddress: string, chainId: string): string {
  return `${chainId}:${contractAddress.toLowerCase()}`;
}

/**
 * Build a compact summary of the audit report for Claude.
 * We DON'T send the full report — it's too many tokens.
 * Only the signals Claude needs to write a useful summary.
 */
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

/**
 * Extract valid JSON from a Claude response.
 * Claude usually returns clean JSON but we defend against stray markdown.
 */
function extractJson(text: string): AiSummary | null {
  try {
    // Try direct parse first
    return JSON.parse(text) as AiSummary;
  } catch {
    // Try to find JSON object inside the text
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as AiSummary;
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

export async function generateAiSummary(
  report: AuditReport,
): Promise<AiSummary | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    debug("ANTHROPIC_API_KEY not set — skipping AI summary");
    return null;
  }

  // Cache check
  const key = cacheKey(report.contractAddress, report.chainId);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    debug("AI summary cache hit");
    return cached.data;
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
        max_tokens: 800,
        temperature: 0.3,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: buildInputContext(report),
          },
        ],
      }),
      // 15s timeout
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      debug("Anthropic API error:", res.status, await res.text().catch(() => ""));
      return null;
    }

    const data = await res.json();
    const text = data?.content?.[0]?.text;
    if (!text || typeof text !== "string") {
      debug("Anthropic returned no text");
      return null;
    }

    const summary = extractJson(text);
    if (!isValidSummary(summary)) {
      debug("Anthropic returned invalid JSON shape");
      return null;
    }

    // Cap paragraphs at 4 and bottomLine at 300 chars for safety
    summary.paragraphs = summary.paragraphs.slice(0, 4);
    if (summary.bottomLine.length > 300) {
      summary.bottomLine = summary.bottomLine.slice(0, 297) + "...";
    }

    cache.set(key, { at: Date.now(), data: summary });

    // Periodic cache prune
    if (cache.size > 500) {
      const now = Date.now();
      for (const [k, v] of cache) {
        if (now - v.at > CACHE_TTL_MS) cache.delete(k);
      }
    }

    return summary;
  } catch (error) {
    debug("AI summary failed:", error);
    return null;
  }
}
