/* ─────────────────────────────────────────────────────────────
   Whale Alert API client
   - Official API: https://docs.whale-alert.io/
   - Free tier: 7-day history, 60 req/hour, $1M+ minimum
   - Requires WHALE_ALERT_API_KEY env var (free registration)
   - When configured, large transactions feed into:
     1. The whale tracker UI (merged with Etherscan data, no
        per-row source attribution — just appears as more whale data)
     2. The signal engine (folded into bullish/bearish signals)
     3. The prediction engine (via signals)
   ───────────────────────────────────────────────────────────── */

import { TtlCache } from "./cache";
import type { WhaleMove, Direction } from "./types";

const CACHE_TTL_MS = 90_000;
const REQUEST_TIMEOUT_MS = 10_000;
/* Pull last 30 minutes of $1M+ transactions every refresh. */
const LOOKBACK_SECONDS = 30 * 60;

const cache = new TtlCache<WhaleMove[]>(CACHE_TTL_MS);

interface WhaleAlertParty {
  address?: string;
  owner?: string;
  owner_type?: string;
}

interface WhaleAlertTx {
  blockchain?: string;
  symbol?: string;
  transaction_type?: string;
  hash?: string;
  from?: WhaleAlertParty;
  to?: WhaleAlertParty;
  timestamp?: number;
  amount?: number;
  amount_usd?: number;
}

interface WhaleAlertResp {
  result?: string;
  cursor?: string;
  count?: number;
  transactions?: WhaleAlertTx[];
}

export function isWhaleAlertConfigured(): boolean {
  return Boolean(process.env.WHALE_ALERT_API_KEY);
}

function shorten(addr: string): string {
  if (!addr) return "—";
  if (addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/* Identify exchange ownership for direction inference. */
const EXCHANGE_KEYWORDS = [
  "binance", "coinbase", "kraken", "bitfinex", "okx", "bybit",
  "kucoin", "huobi", "gate.io", "bitstamp", "gemini",
];

function isExchange(party: WhaleAlertParty | undefined): boolean {
  const owner = (party?.owner ?? "").toLowerCase();
  const ownerType = (party?.owner_type ?? "").toLowerCase();
  if (ownerType === "exchange") return true;
  return EXCHANGE_KEYWORDS.some((k) => owner.includes(k));
}

function classifyTx(tx: WhaleAlertTx): {
  direction: Direction;
  action: string;
} {
  const fromExch = isExchange(tx.from);
  const toExch = isExchange(tx.to);
  const fromOwner = tx.from?.owner ?? "unknown wallet";
  const toOwner = tx.to?.owner ?? "unknown wallet";

  /* Outflow from exchange to wallet → potential accumulation (bullish). */
  if (fromExch && !toExch) {
    return {
      direction: "bullish",
      action: `Exchange outflow · ${fromOwner}`,
    };
  }
  /* Inflow to exchange → potential sell-side pressure (bearish). */
  if (!fromExch && toExch) {
    return {
      direction: "bearish",
      action: `Exchange inflow · ${toOwner}`,
    };
  }
  /* Exchange to exchange → neutral routing. */
  if (fromExch && toExch) {
    return {
      direction: "neutral",
      action: `Exchange transfer · ${fromOwner} → ${toOwner}`,
    };
  }
  /* Wallet to wallet → neutral whale flow. */
  return {
    direction: "neutral",
    action: `Whale transfer · ${tx.blockchain ?? "chain"}`,
  };
}

export async function fetchWhaleAlertMoves(): Promise<WhaleMove[]> {
  const apiKey = process.env.WHALE_ALERT_API_KEY;
  if (!apiKey) return [];

  const cached = cache.get("all");
  if (cached) return cached;

  const startTimestamp =
    Math.floor(Date.now() / 1000) - LOOKBACK_SECONDS;
  const url =
    "https://api.whale-alert.io/v1/transactions" +
    `?api_key=${apiKey}` +
    `&start=${startTimestamp}` +
    "&min_value=1000000" +
    "&limit=20";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      const stale = cache.getStale("all");
      return stale ?? [];
    }

    const json = (await res.json()) as WhaleAlertResp;
    if (json.result !== "success" || !Array.isArray(json.transactions)) {
      const stale = cache.getStale("all");
      return stale ?? [];
    }

    const moves: WhaleMove[] = json.transactions
      .filter((tx) => typeof tx.amount_usd === "number" && tx.amount_usd >= 1_000_000)
      .map((tx, i) => {
        const cls = classifyTx(tx);
        const counterparty =
          cls.direction === "bullish"
            ? tx.to?.address
            : cls.direction === "bearish"
            ? tx.from?.address
            : tx.to?.address;

        return {
          id: tx.hash ?? `wa-${i}-${tx.timestamp}`,
          address: shorten(counterparty ?? ""),
          action: cls.action,
          amountUsd: Math.round(tx.amount_usd ?? 0),
          asset: (tx.symbol ?? "").toUpperCase(),
          direction: cls.direction,
          timestamp: (tx.timestamp ?? Math.floor(Date.now() / 1000)) * 1000,
        };
      });

    cache.set("all", moves);
    return moves;
  } catch {
    const stale = cache.getStale("all");
    return stale ?? [];
  } finally {
    clearTimeout(timer);
  }
}
