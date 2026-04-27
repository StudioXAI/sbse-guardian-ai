/* ─────────────────────────────────────────────────────────────
   Alpha Assistant API
   - Context-aware AI helper that sits in a floating widget on
     every Alpha page
   - On every question: fetches latest signals + market snapshot
     so the AI is always grounded in current real-time data
   - Uses claude-haiku-4-5 (same model as aiSummary.ts) for
     speed and cost efficiency
   ───────────────────────────────────────────────────────────── */

import { NextResponse } from "next/server";
import { fetchMarketSnapshot } from "@/lib/alpha/marketPrices";
import { getSignals } from "@/lib/alpha/signalEngine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5";
const REQUEST_TIMEOUT_MS = 25_000;

const SECTION_DESCRIPTIONS: Record<string, string> = {
  overview:
    "the Overview tab. It shows top-level stats: signals active, threats blocked in the last 24h, wallets monitored, whales active today, and ecosystem health %. Includes a Quick Actions panel for navigating to other sections.",
  signals:
    "the Signals tab. Two columns: Market signals (whales, Polymarket, DefiLlama liquidity moves) and INFI ecosystem signals. Each has a direction (bullish/bearish/neutral) and an impact score 0-100.",
  predictions:
    "the Predictions tab. Shows AI-generated forecasts for BTC/ETH/SOL/INFI plus multi-timeframe BTC outlook. Now includes Top 50 crypto by market cap (CoinGecko) and Top 50 US stocks (Yahoo Finance).",
  liquidity:
    "the Liquidity tab. Four sub-panels: DefiLlama (DeFi TVL flows), Order Book (Bookmap-style real-time bid/ask depth from Binance/Coinbase), Coinglass (liquidations, OI, funding rates — needs API key), TradingView (embedded charts).",
  whales:
    "the Whales tab. Shows live $1M+ stablecoin and major-asset transfers on tracked exchange wallets (Binance hot/cold, Coinbase Prime, Kraken, Bitfinex). Sourced from Etherscan tokentx.",
  polymarket:
    "the Polymarket tab. Shows top 50 real-money prediction markets, with each bet's YES% and inferred bullish/bearish/neutral signal. Includes a Market Impact summary showing whether the smart money lean is positive or negative for crypto and stocks overall.",
  infi:
    "the INFI tab. Status dashboard for the INFI MultiChain ecosystem: Live components (Launchpad, SbSe Protocol, Accelerator), Upcoming (InvertX Q2-Q3 2026), Concept stage (INFI Decentralized Blockchain). Plus official social channel links.",
  social:
    "the Social tab. Live feed from @INFI_MultiChain on X (when X_BEARER_TOKEN is configured) and a tap-to-open card to the official INFI MultiChain LinkedIn page. Aggregated influencer sentiment is also surfaced when available.",
};

interface AssistantRequest {
  question?: string;
  section?: string;
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { success: false, message: "AI assistant unavailable — no API key configured." },
      { status: 503 },
    );
  }

  try {
    const body = (await request.json()) as AssistantRequest;
    const question = (body.question ?? "").trim();
    const section = body.section ?? "overview";

    if (!question || question.length < 2) {
      return NextResponse.json(
        { success: false, message: "Please ask a question." },
        { status: 400 },
      );
    }
    if (question.length > 500) {
      return NextResponse.json(
        { success: false, message: "Question is too long — keep under 500 characters." },
        { status: 400 },
      );
    }

    /* Pull live context — this is what makes the assistant grounded
       in current data instead of making things up. */
    const [snapshot, signals] = await Promise.all([
      fetchMarketSnapshot(),
      getSignals(),
    ]);

    const sectionDesc =
      SECTION_DESCRIPTIONS[section] ?? SECTION_DESCRIPTIONS.overview;

    const priceContext = snapshot
      ? `Current spot prices (live, from CoinGecko):
- BTC: $${snapshot.btc.usd.toFixed(0)} (${snapshot.btc.change24h >= 0 ? "+" : ""}${snapshot.btc.change24h.toFixed(2)}% 24h)
- ETH: $${snapshot.eth.usd.toFixed(2)} (${snapshot.eth.change24h >= 0 ? "+" : ""}${snapshot.eth.change24h.toFixed(2)}% 24h)
- SOL: $${snapshot.sol.usd.toFixed(2)} (${snapshot.sol.change24h >= 0 ? "+" : ""}${snapshot.sol.change24h.toFixed(2)}% 24h)`
      : "Live spot prices unavailable right now.";

    const signalSummary = signals.slice(0, 8).map((s) => ({
      source: s.source,
      direction: s.direction,
      score: s.score,
      text: s.text.slice(0, 120),
    }));

    const systemPrompt = `You are SbSe Guardian Alpha's built-in AI assistant. Your job is to help users understand what they're seeing and answer questions about the data on the page.

The user is currently looking at: ${sectionDesc}

${priceContext}

Top live signals (newest first):
${JSON.stringify(signalSummary, null, 2)}

Rules:
- Be concise: 2-4 sentences max for most questions, longer only if the user asks for detail.
- Reference live numbers from the context above when relevant — never invent prices or stats.
- Predictions are signals, not financial advice. If asked "should I buy", redirect to "here's what the signals say, decide for yourself."
- If asked about a section/feature, explain what it shows and how to use it.
- If asked about something not in the context, say you don't have that data right now rather than guessing.
- Use plain English. No emoji. No markdown headers. No bullet lists unless explicitly asked.
- Don't reveal which specific accounts feed into "influencer sentiment" — that's a private list.`;

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
          max_tokens: 400,
          system: systemPrompt,
          messages: [{ role: "user", content: question }],
        }),
      });

      if (!res.ok) {
        return NextResponse.json(
          {
            success: false,
            message: "AI assistant request failed. Try again in a moment.",
          },
          { status: 500 },
        );
      }

      const json = await res.json();
      const text: string = json?.content?.[0]?.text ?? "";

      return NextResponse.json({ success: true, data: { answer: text } });
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    return NextResponse.json(
      {
        success: false,
        message: e instanceof Error ? e.message : "Assistant error.",
      },
      { status: 500 },
    );
  }
}
