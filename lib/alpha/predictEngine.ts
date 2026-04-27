/* ─────────────────────────────────────────────────────────────
   Alpha AI Prediction Engine
   - Same Anthropic API pattern as lib/aiSummary.ts
   - Uses claude-haiku-4-5 (cheap, fast)
   - 5-minute cache: predictions don't need to refresh constantly
   - Returns directional bias + confidence per asset
   ───────────────────────────────────────────────────────────── */

import { TtlCache } from "./cache";
import { fetchMarketSnapshot } from "./marketPrices";
import { fetchInfluencerSentiment } from "./influencerTracker";
import { computeAltSeasonIndex } from "./altSeasonIndex";
import type { AssetPrediction, Direction, PredictionResponse, Signal } from "./types";

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5";
const CACHE_TTL_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;

const cache = new TtlCache<PredictionResponse>(CACHE_TTL_MS);

const SYSTEM_PROMPT = `You are SbSe Guardian Alpha — a market intelligence analyst for retail crypto users.

Your job: synthesize a list of live market signals into a short, honest forecast.

Output strict JSON matching this shape exactly:
{
  "summary": "2-3 sentence narrative. Plain English. Highlight ONE bullish driver and ONE risk. No hype, no financial advice clichés.",
  "shortHorizon": [
    { "asset": "BTC", "direction": "bullish|bearish|neutral", "confidence": 70, "target": "$64,820", "reason": "one short clause" },
    { "asset": "ETH", "direction": "bullish|bearish|neutral", "confidence": 60, "target": "$3,150–3,220", "reason": "one short clause" },
    { "asset": "SOL", "direction": "bullish|bearish|neutral", "confidence": 65, "target": "$156", "reason": "one short clause" },
    { "asset": "INFI", "direction": "neutral", "confidence": 55, "target": "Range-bound", "reason": "Limited liquidity" }
  ],
  "btcMultiTimeframe": [
    { "asset": "1H", "direction": "...", "confidence": 70, "target": "$64,200" },
    { "asset": "4H", "direction": "...", "confidence": 65, "target": "$65,840" },
    { "asset": "1D", "direction": "...", "confidence": 58, "target": "$63K-66K" },
    { "asset": "1W", "direction": "...", "confidence": 55, "target": "$59,400" }
  ]
}

Rules:
- Confidence 0-100 integers only.
- direction MUST be exactly "bullish", "bearish", or "neutral".
- Be honest: if signals conflict, say neutral and explain.
- NEVER recommend a buy or sell. NEVER predict precise percent moves.
- Output ONLY the JSON object. No markdown, no commentary.`;

interface RawPrediction {
  summary: string;
  shortHorizon: AssetPrediction[];
  btcMultiTimeframe: AssetPrediction[];
}

function isDirection(v: unknown): v is Direction {
  return v === "bullish" || v === "bearish" || v === "neutral";
}

function sanitizePrediction(raw: unknown): RawPrediction | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.summary !== "string") return null;
  if (!Array.isArray(r.shortHorizon) || !Array.isArray(r.btcMultiTimeframe)) return null;

  const cleanArray = (arr: unknown[]): AssetPrediction[] => {
    const out: AssetPrediction[] = [];
    for (const entry of arr) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as Record<string, unknown>;
      if (typeof e.asset !== "string" || !isDirection(e.direction)) continue;
      const confidence =
        typeof e.confidence === "number"
          ? Math.max(0, Math.min(100, Math.round(e.confidence)))
          : 50;
      out.push({
        asset: e.asset,
        direction: e.direction,
        confidence,
        target: typeof e.target === "string" ? e.target : undefined,
        reason: typeof e.reason === "string" ? e.reason : undefined,
      });
    }
    return out;
  };

  return {
    summary: r.summary,
    shortHorizon: cleanArray(r.shortHorizon),
    btcMultiTimeframe: cleanArray(r.btcMultiTimeframe),
  };
}

/** Honest unavailable state when the AI service can't be reached.
   Returns no fake price targets — the UI shows a clear "unavailable"
   message rather than hallucinated data. */
function unavailable(): RawPrediction {
  return {
    summary:
      "AI prediction service is temporarily unavailable. Live signal data is still flowing in the Signals tab — review those directly. Try refreshing predictions in 1–2 minutes.",
    shortHorizon: [],
    btcMultiTimeframe: [],
  };
}

async function callAnthropic(signals: Signal[]): Promise<RawPrediction | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const top = signals.slice(0, 12).map((s) => ({
    source: s.source,
    asset: s.asset || "—",
    direction: s.direction,
    score: s.score,
    text: s.text,
  }));

  /* Fetch real prices, influencer sentiment, and alt season index in
     parallel so the AI grounds targets in actual current spot levels
     and current cross-asset context. */
  const [snapshot, influencerSentiment, altSeason] = await Promise.all([
    fetchMarketSnapshot(),
    fetchInfluencerSentiment(),
    computeAltSeasonIndex(),
  ]);

  const priceContext = snapshot
    ? `Current spot prices (real, from CoinGecko):
- BTC: $${snapshot.btc.usd.toFixed(0)} (${snapshot.btc.change24h >= 0 ? "+" : ""}${snapshot.btc.change24h.toFixed(2)}% 24h)
- ETH: $${snapshot.eth.usd.toFixed(2)} (${snapshot.eth.change24h >= 0 ? "+" : ""}${snapshot.eth.change24h.toFixed(2)}% 24h)
- SOL: $${snapshot.sol.usd.toFixed(2)} (${snapshot.sol.change24h >= 0 ? "+" : ""}${snapshot.sol.change24h.toFixed(2)}% 24h)

Use these as anchors for any target price you generate. Do not invent prices that contradict spot.`
    : "Live prices unavailable — generate ranges, not exact targets.";

  /* Influencer sentiment is anonymized — it's an aggregate score from
     a private list of curated X accounts, never tied to specific names
     in the response. The high-conviction flag, when set, indicates the
     operator-flagged account has posted strongly. Weight this signal
     ~30% when it has decent confidence. */
  const influencerContext = influencerSentiment
    ? `Influencer aggregate sentiment (private, weighted):
- Crypto: ${influencerSentiment.cryptoSentiment >= 0 ? "+" : ""}${influencerSentiment.cryptoSentiment} (${influencerSentiment.cryptoDirection})
- Stocks/macro: ${influencerSentiment.stockSentiment >= 0 ? "+" : ""}${influencerSentiment.stockSentiment} (${influencerSentiment.stockDirection})
- Confidence: ${influencerSentiment.confidence}/100 from ${influencerSentiment.postsScored} posts across ${influencerSentiment.accountsContributing} accounts
- High-conviction flag: ${influencerSentiment.highConvictionFlag ? "YES — operator-flagged voice posting strongly" : "no"}

Treat this as an additional input, not a primary driver. Do not name accounts.`
    : "";

  const altSeasonContext = altSeason
    ? `Alt Season Index: ${altSeason.index}/100 (${altSeason.label}) — ${altSeason.altcoinsOutperforming} of ${altSeason.totalAltcoins} top altcoins outperforming BTC over 7 days. BTC 7d: ${altSeason.btcChange7dPct >= 0 ? "+" : ""}${altSeason.btcChange7dPct.toFixed(2)}%. Use this to calibrate alt-vs-BTC bias in your forecasts.`
    : "";

  const userPrompt = `${priceContext}

${altSeasonContext}

${influencerContext}

Live signals to synthesize (newest first):

${JSON.stringify(top, null, 2)}

Generate the prediction JSON now.`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(ANTHROPIC_API, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 800,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!res.ok) return null;

    const json = await res.json();
    const text: string = json?.content?.[0]?.text ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;

    return sanitizePrediction(JSON.parse(match[0]));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function generatePrediction(signals: Signal[]): Promise<PredictionResponse> {
  const cached = cache.get("latest");
  if (cached) return { ...cached, cached: true };

  const aiResult = await callAnthropic(signals);
  const data = aiResult ?? unavailable();

  const response: PredictionResponse = {
    summary: data.summary,
    shortHorizon: data.shortHorizon,
    btcMultiTimeframe: data.btcMultiTimeframe,
    generatedAt: Date.now(),
    cached: false,
  };

  cache.set("latest", response);
  return response;
}
