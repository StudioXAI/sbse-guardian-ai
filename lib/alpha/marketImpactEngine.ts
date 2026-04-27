/* ─────────────────────────────────────────────────────────────
   Market Impact Engine
   - Takes Polymarket bets and infers their impact on crypto/stocks
   - Uses keyword-based topic classification + YES% to direction
   - Aggregate sentiment shows whether the smart money is leaning
     positively or negatively for each market
   ───────────────────────────────────────────────────────────── */

import type { PolymarketBet, Direction } from "./types";

export interface MarketImpact {
  /** Topic-tagged bets the system identified as relevant. */
  cryptoRelevant: PolymarketBet[];
  stockRelevant: PolymarketBet[];
  macroRelevant: PolymarketBet[];

  /** Aggregate impact scores, -100 (very negative) to +100 (very positive). */
  cryptoImpact: number;
  stockImpact: number;

  /** Direction labels. */
  cryptoDirection: Direction;
  stockDirection: Direction;

  /** Total volume backing each topic (real-money conviction). */
  cryptoVolumeUsd: number;
  stockVolumeUsd: number;

  /** Plain-English explanation of the impact. */
  cryptoNarrative: string;
  stockNarrative: string;
}

const CRYPTO_KEYWORDS = [
  "bitcoin", "btc", "ethereum", "eth", "solana", "sol",
  "crypto", "stablecoin", "etf", "blackrock", "spot",
  "halving", "altcoin", "memecoin",
];

const STOCK_KEYWORDS = [
  "stocks", "s&p", "nasdaq", "dow jones", "spy", "qqq",
  "earnings", "tesla", "apple", "nvidia", "microsoft",
  "ipo", "tech", "ai stocks",
];

const MACRO_KEYWORDS = [
  "fed", "fomc", "rate", "inflation", "cpi", "recession",
  "unemployment", "gdp", "trump", "election", "ukraine",
  "war", "oil", "gas",
];

/* Whether a question's resolution is positive for risk assets.
   Returns:
   - +1: YES is good for risk assets (e.g., "Will Fed cut rates?")
   - -1: YES is bad for risk assets (e.g., "Will recession hit?")
   - 0:  Neutral or unclear */
function questionPolarity(question: string): number {
  const q = question.toLowerCase();

  /* Negative-for-risk-assets if YES wins. */
  const NEGATIVE_PHRASES = [
    "recession", "crash", "ban", "war",
    "rate hike", "raise rates", "hike rates",
    "default", "shutdown", "tariff",
    "bankrupt", "delist",
  ];
  for (const p of NEGATIVE_PHRASES) {
    if (q.includes(p)) return -1;
  }

  /* Positive-for-risk-assets if YES wins. */
  const POSITIVE_PHRASES = [
    "rate cut", "cut rates", "cuts rates",
    "ath", "all-time high", "etf approve",
    "halving", "adoption", "approved",
    "100k", "200k", "rally",
  ];
  for (const p of POSITIVE_PHRASES) {
    if (q.includes(p)) return 1;
  }

  return 0;
}

function classify(bet: PolymarketBet): {
  isCrypto: boolean;
  isStock: boolean;
  isMacro: boolean;
} {
  const text = bet.question.toLowerCase();
  return {
    isCrypto: CRYPTO_KEYWORDS.some((k) => text.includes(k)),
    isStock: STOCK_KEYWORDS.some((k) => text.includes(k)),
    isMacro: MACRO_KEYWORDS.some((k) => text.includes(k)),
  };
}

/* For a single bet, compute its impact contribution.
   Returns -100 to +100. */
function impactOf(bet: PolymarketBet): number {
  const polarity = questionPolarity(bet.question);
  if (polarity === 0) return 0;

  /* yesPct above 50% leans YES, below leans NO. */
  const lean = (bet.yesPct - 50) * 2; // -100 to +100
  return polarity * lean;
}

function dirFrom(score: number): Direction {
  if (score >= 20) return "bullish";
  if (score <= -20) return "bearish";
  return "neutral";
}

function narrative(
  topic: "crypto" | "stocks",
  impact: number,
  volumeUsd: number,
  count: number,
): string {
  if (count === 0) {
    return `No ${topic}-relevant bets currently active on Polymarket above the volume threshold.`;
  }

  const topicLabel = topic === "crypto" ? "crypto" : "stock";
  const volStr =
    volumeUsd >= 1_000_000
      ? `$${(volumeUsd / 1_000_000).toFixed(1)}M`
      : `$${(volumeUsd / 1_000).toFixed(0)}K`;

  if (impact >= 30) {
    return `Real-money consensus is strongly positive for ${topicLabel} markets — ${count} bets totaling ${volStr} lean toward outcomes that historically push prices higher.`;
  }
  if (impact >= 10) {
    return `Mildly positive lean for ${topicLabel} — ${count} bets totaling ${volStr} suggest moderate upside.`;
  }
  if (impact <= -30) {
    return `Real-money consensus is strongly negative for ${topicLabel} markets — ${count} bets totaling ${volStr} lean toward outcomes that historically push prices lower.`;
  }
  if (impact <= -10) {
    return `Mildly negative lean for ${topicLabel} — ${count} bets totaling ${volStr} suggest moderate downside.`;
  }
  return `Neutral overall — ${count} ${topicLabel}-relevant bets totaling ${volStr} are mixed, no clear directional consensus.`;
}

export function computeMarketImpact(bets: PolymarketBet[]): MarketImpact {
  const cryptoRelevant: PolymarketBet[] = [];
  const stockRelevant: PolymarketBet[] = [];
  const macroRelevant: PolymarketBet[] = [];

  for (const bet of bets) {
    const c = classify(bet);
    if (c.isCrypto) cryptoRelevant.push(bet);
    if (c.isStock) stockRelevant.push(bet);
    if (c.isMacro) {
      /* Macro bets affect both. Add to macro list but also weight into both impacts. */
      macroRelevant.push(bet);
      if (!c.isCrypto) cryptoRelevant.push(bet);
      if (!c.isStock) stockRelevant.push(bet);
    }
  }

  function aggregate(subset: PolymarketBet[]): {
    impact: number;
    volume: number;
  } {
    if (subset.length === 0) return { impact: 0, volume: 0 };
    const totalVolume = subset.reduce((a, b) => a + b.volumeUsd, 0);
    if (totalVolume === 0) return { impact: 0, volume: 0 };
    const weightedSum = subset.reduce(
      (a, b) => a + impactOf(b) * b.volumeUsd,
      0,
    );
    return {
      impact: Math.round(weightedSum / totalVolume),
      volume: totalVolume,
    };
  }

  const crypto = aggregate(cryptoRelevant);
  const stocks = aggregate(stockRelevant);

  return {
    cryptoRelevant,
    stockRelevant,
    macroRelevant,
    cryptoImpact: crypto.impact,
    stockImpact: stocks.impact,
    cryptoDirection: dirFrom(crypto.impact),
    stockDirection: dirFrom(stocks.impact),
    cryptoVolumeUsd: crypto.volume,
    stockVolumeUsd: stocks.volume,
    cryptoNarrative: narrative(
      "crypto",
      crypto.impact,
      crypto.volume,
      cryptoRelevant.length,
    ),
    stockNarrative: narrative(
      "stocks",
      stocks.impact,
      stocks.volume,
      stockRelevant.length,
    ),
  };
}
