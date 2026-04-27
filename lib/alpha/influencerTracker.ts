/* ─────────────────────────────────────────────────────────────
   Influencer Sentiment Tracker (PRIVATE / SERVER-SIDE)

   Curates a list of high-signal X accounts and aggregates their
   recent posts into anonymized sentiment data.

   IMPORTANT — privacy/policy notes:
   - Influencer handles are NEVER returned in any API response.
   - Only aggregate sentiment numbers are exposed publicly.
   - Individual posts are processed server-side and discarded
     after sentiment scoring. Only the score contributes to the
     prediction signal.
   - @NoLimitGains is weighted 2× because the operator has flagged
     his analysis as particularly high-conviction. Other handles
     are weighted 1×.

   Requires X_BEARER_TOKEN env var. Without it, this module
   returns null/empty and nothing observable changes.
   ───────────────────────────────────────────────────────────── */

import { TtlCache } from "./cache";
import type { Direction } from "./types";

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 min — X rate limits are tight
const REQUEST_TIMEOUT_MS = 10_000;

/* Curated internal list. NEVER export this directly. */
interface TrackedHandle {
  handle: string;
  weight: number;
  topics: Array<"crypto" | "stocks" | "macro">;
}

const TRACKED_HANDLES: TrackedHandle[] = [
  /* Operator-flagged high-conviction account — 2× weight. */
  { handle: "NoLimitGains", weight: 2.0, topics: ["crypto", "stocks", "macro"] },
  /* Other curated accounts — 1× weight. */
  { handle: "CryptoCapo_", weight: 1.0, topics: ["crypto"] },
  { handle: "Pentosh1", weight: 1.0, topics: ["crypto"] },
  { handle: "rektcapital", weight: 1.0, topics: ["crypto"] },
  { handle: "LynAldenContact", weight: 1.0, topics: ["macro", "stocks"] },
  { handle: "charliebilello", weight: 1.0, topics: ["stocks", "macro"] },
];

export interface InfluencerSentiment {
  /** Aggregate sentiment for crypto markets, -100 (bearish) to +100 (bullish). */
  cryptoSentiment: number;
  /** Aggregate sentiment for stocks/macro, -100 to +100. */
  stockSentiment: number;
  /** Direction inferred from sentiment magnitude. */
  cryptoDirection: Direction;
  stockDirection: Direction;
  /** Number of distinct accounts contributing (de-anonymized count only). */
  accountsContributing: number;
  /** Number of recent posts scored. */
  postsScored: number;
  /** Confidence 0-100 based on coverage and conviction. */
  confidence: number;
  /** Whether the operator-flagged account had a recent high-conviction post. */
  highConvictionFlag: boolean;
  generatedAt: number;
}

const cache = new TtlCache<InfluencerSentiment | null>(CACHE_TTL_MS);

interface XUserResp {
  data?: { id?: string };
}
interface XTweet {
  id?: string;
  text?: string;
  created_at?: string;
  public_metrics?: {
    like_count?: number;
    retweet_count?: number;
  };
}
interface XTweetsResp {
  data?: XTweet[];
}

interface ScoredPost {
  weight: number;
  topic: "crypto" | "stocks";
  /** -1 (bearish) to +1 (bullish). */
  sentiment: number;
  /** 0-1 conviction. */
  conviction: number;
  isHighConviction: boolean;
}

async function resolveUserId(
  handle: string,
  token: string,
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://api.twitter.com/2/users/by/username/${handle}`,
      {
        signal: controller.signal,
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as XUserResp;
    return json.data?.id ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchUserTweets(
  userId: string,
  token: string,
): Promise<XTweet[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://api.twitter.com/2/users/${userId}/tweets?max_results=10` +
        "&tweet.fields=created_at,public_metrics",
      {
        signal: controller.signal,
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!res.ok) return [];
    const json = (await res.json()) as XTweetsResp;
    return json.data ?? [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/* Lightweight keyword-based sentiment scoring. We avoid hitting the
   Anthropic API for every tweet since that would 50× our token spend.
   The scoring is heuristic but effective at the aggregate level. */
const BULL_TOKENS = [
  "bull", "bullish", "long", "buy", "accumulate", "support", "breakout",
  "rally", "moon", "pump", "ath", "all-time high", "uptrend", "calls",
  "alpha", "send it", "🚀", "📈",
];
const BEAR_TOKENS = [
  "bear", "bearish", "short", "sell", "dump", "crash", "resistance",
  "rejection", "downtrend", "puts", "rekt", "liquidate", "💀", "📉",
];
const CRYPTO_TOKENS = [
  "btc", "bitcoin", "eth", "ethereum", "sol", "solana", "crypto",
  "altcoin", "memecoin", "defi", "stablecoin",
];
const STOCK_TOKENS = [
  "spy", "qqq", "nasdaq", "s&p", "stocks", "fed", "fomc", "rate",
  "earnings", "aapl", "msft", "nvda", "tsla",
];

function classifyTweet(t: XTweet): ScoredPost | null {
  const text = (t.text ?? "").toLowerCase();
  if (!text) return null;

  let bull = 0;
  let bear = 0;
  for (const tok of BULL_TOKENS) if (text.includes(tok)) bull++;
  for (const tok of BEAR_TOKENS) if (text.includes(tok)) bear++;

  if (bull === 0 && bear === 0) return null;

  const cryptoHits = CRYPTO_TOKENS.filter((t) => text.includes(t)).length;
  const stockHits = STOCK_TOKENS.filter((t) => text.includes(t)).length;
  if (cryptoHits === 0 && stockHits === 0) return null;

  const total = bull + bear;
  const sentiment = (bull - bear) / total; // -1 to +1
  const conviction = Math.min(1, total / 3);
  const isHighConviction = total >= 3;

  return {
    weight: 1, // overridden by caller
    topic: cryptoHits >= stockHits ? "crypto" : "stocks",
    sentiment,
    conviction,
    isHighConviction,
  };
}

export async function fetchInfluencerSentiment(): Promise<InfluencerSentiment | null> {
  const token = process.env.X_BEARER_TOKEN;
  if (!token) return null;

  const cached = cache.get("agg");
  if (cached !== undefined) return cached;

  const allScored: ScoredPost[] = [];
  let highConvictionFlag = false;
  const contributors = new Set<string>();

  /* Fetch in parallel. X's rate limits are per endpoint, not per token. */
  const results = await Promise.all(
    TRACKED_HANDLES.map(async (h) => {
      const userId = await resolveUserId(h.handle, token);
      if (!userId) return { handle: h, posts: [] as XTweet[] };
      const posts = await fetchUserTweets(userId, token);
      return { handle: h, posts };
    }),
  );

  for (const { handle, posts } of results) {
    let counted = 0;
    for (const post of posts) {
      const scored = classifyTweet(post);
      if (!scored) continue;
      scored.weight = handle.weight;
      allScored.push(scored);
      counted++;

      /* If the operator-flagged handle has any high-conviction post,
         set the flag. The flag itself doesn't reveal the handle. */
      if (handle.weight >= 2.0 && scored.isHighConviction) {
        highConvictionFlag = true;
      }
    }
    if (counted > 0) contributors.add(handle.handle);
  }

  if (allScored.length === 0) {
    cache.set("agg", null);
    return null;
  }

  /* Weighted sentiment by topic. */
  function aggregate(topic: "crypto" | "stocks"): number {
    const subset = allScored.filter((s) => s.topic === topic);
    if (subset.length === 0) return 0;
    const totalWeight = subset.reduce(
      (a, s) => a + s.weight * s.conviction,
      0,
    );
    if (totalWeight === 0) return 0;
    const weightedSum = subset.reduce(
      (a, s) => a + s.weight * s.conviction * s.sentiment,
      0,
    );
    return Math.round((weightedSum / totalWeight) * 100);
  }

  const cryptoSent = aggregate("crypto");
  const stockSent = aggregate("stocks");

  function dirFrom(score: number): Direction {
    if (score >= 25) return "bullish";
    if (score <= -25) return "bearish";
    return "neutral";
  }

  /* Confidence is a function of coverage + conviction density. */
  const confidence = Math.min(
    100,
    Math.round(
      (allScored.length / 30) * 50 +
        (contributors.size / TRACKED_HANDLES.length) * 50,
    ),
  );

  const aggregated: InfluencerSentiment = {
    cryptoSentiment: cryptoSent,
    stockSentiment: stockSent,
    cryptoDirection: dirFrom(cryptoSent),
    stockDirection: dirFrom(stockSent),
    accountsContributing: contributors.size,
    postsScored: allScored.length,
    confidence,
    highConvictionFlag,
    generatedAt: Date.now(),
  };

  cache.set("agg", aggregated);
  return aggregated;
}
