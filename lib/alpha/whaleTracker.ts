/* ─────────────────────────────────────────────────────────────
   Live Whale Tracker via Etherscan
   - Uses the `tokentx` endpoint to capture ERC-20 transfers
   - Tracks USDT, USDC (1:1 USD), WBTC (× BTC price), WETH (× ETH price)
   - Most exchange wallet movement at the $1M+ level is in stablecoins,
     not native ETH — using `txlist` (native ETH only) misses 99% of
     real whale activity.
   - 90-second cache.
   ───────────────────────────────────────────────────────────── */

import { TtlCache } from "./cache";
import type { WhaleMove, Direction } from "./types";

const CACHE_TTL_MS = 90_000;
const ETHERSCAN_API = "https://api.etherscan.io/api";
const REQUEST_TIMEOUT_MS = 10_000;

const cache = new TtlCache<WhaleMove[]>(CACHE_TTL_MS);

interface KnownWallet {
  address: string;
  label: string;
}

const TRACKED_WALLETS: KnownWallet[] = [
  { address: "0x28C6c06298d514Db089934071355E5743bf21d60", label: "Binance hot wallet" },
  { address: "0x21a31Ee1afC51d94C2eFcCAa2092aD1028285549", label: "Binance cold wallet" },
  { address: "0x71660c4005ba85c37ccec55d0c4493e66fe775d3", label: "Coinbase Prime" },
  { address: "0x2910543af39aba0cd09dbb2d50200b3e800a63d2", label: "Kraken" },
  { address: "0x77696bb39917C91A0c3908D577d5e322095425cA", label: "Bitfinex" },
];

interface PriceMap {
  eth: number;
  btc: number;
}

interface TokenInfo {
  decimals: number;
  symbol: string;
  toUsd: (amount: number, prices: PriceMap) => number;
}

/* Tokens we know how to value. Contract addresses are lowercase
   for easy comparison against Etherscan's response. */
const TRACKED_TOKENS: Record<string, TokenInfo> = {
  "0xdac17f958d2ee523a2206206994597c13d831ec7": {
    decimals: 6,
    symbol: "USDT",
    toUsd: (amt) => amt,
  },
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": {
    decimals: 6,
    symbol: "USDC",
    toUsd: (amt) => amt,
  },
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": {
    decimals: 18,
    symbol: "WETH",
    toUsd: (amt, p) => amt * p.eth,
  },
  "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599": {
    decimals: 8,
    symbol: "WBTC",
    toUsd: (amt, p) => amt * p.btc,
  },
};

interface EtherscanTokenTx {
  hash?: string;
  from?: string;
  to?: string;
  value?: string;
  contractAddress?: string;
  tokenSymbol?: string;
  tokenDecimal?: string;
  timeStamp?: string;
}

interface EtherscanResponse {
  status?: string;
  message?: string;
  result?: EtherscanTokenTx[];
}

function shorten(addr: string): string {
  if (!addr) return "";
  if (addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function classifyDirection(isInflow: boolean): {
  direction: Direction;
  action: string;
} {
  if (isInflow) return { direction: "neutral", action: "Inflow to exchange" };
  return { direction: "bullish", action: "Outflow from exchange" };
}

async function fetchTokenTxsForWallet(
  wallet: KnownWallet,
  apiKey: string,
  prices: PriceMap,
): Promise<WhaleMove[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const url =
      `${ETHERSCAN_API}?module=account&action=tokentx` +
      `&address=${wallet.address}` +
      `&page=1&offset=100&sort=desc` +
      `&apikey=${apiKey}`;

    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return [];

    const json = (await res.json()) as EtherscanResponse;
    if (json.status !== "1" || !Array.isArray(json.result)) return [];

    const moves: WhaleMove[] = [];

    for (const tx of json.result.slice(0, 80)) {
      const contractAddr = (tx.contractAddress ?? "").toLowerCase();
      const token = TRACKED_TOKENS[contractAddr];
      if (!token) continue;

      const rawValue = BigInt(tx.value ?? "0");
      /* Use the token's decimals. Etherscan also returns tokenDecimal,
         but our hardcoded value is more authoritative. */
      const tokenAmount = Number(rawValue) / Math.pow(10, token.decimals);
      const usdValue = token.toUsd(tokenAmount, prices);

      if (!Number.isFinite(usdValue) || usdValue < 1_000_000) continue;

      const isInflow =
        (tx.to ?? "").toLowerCase() === wallet.address.toLowerCase();
      const cls = classifyDirection(isInflow);
      const counterparty = isInflow ? tx.from : tx.to;
      const ts = tx.timeStamp ? parseInt(tx.timeStamp, 10) * 1000 : Date.now();

      moves.push({
        id: tx.hash ?? `${wallet.address}-${ts}`,
        address: counterparty
          ? shorten(counterparty)
          : shorten(wallet.address),
        action: `${cls.action} · ${wallet.label}`,
        amountUsd: Math.round(usdValue),
        asset: token.symbol,
        direction: cls.direction,
        timestamp: ts,
      });
    }

    return moves;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function getPrices(): Promise<PriceMap> {
  const cgKey = process.env.COINGECKO_API_KEY;
  const url =
    "https://api.coingecko.com/api/v3/simple/price?ids=ethereum,bitcoin&vs_currencies=usd";
  const headers: Record<string, string> = { Accept: "application/json" };
  if (cgKey) headers["x-cg-demo-api-key"] = cgKey;

  try {
    const res = await fetch(url, { headers });
    if (!res.ok) return { eth: 3200, btc: 65000 };
    const json = (await res.json()) as {
      ethereum?: { usd?: number };
      bitcoin?: { usd?: number };
    };
    return {
      eth: json.ethereum?.usd ?? 3200,
      btc: json.bitcoin?.usd ?? 65000,
    };
  } catch {
    return { eth: 3200, btc: 65000 };
  }
}

export async function fetchLiveWhaleMoves(): Promise<WhaleMove[]> {
  const cached = cache.get("all");
  if (cached) return cached;

  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) return [];

  const prices = await getPrices();

  /* Hit each tracked wallet in parallel. */
  const results = await Promise.all(
    TRACKED_WALLETS.map((w) => fetchTokenTxsForWallet(w, apiKey, prices)),
  );

  const all = results
    .flat()
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 12);

  if (all.length > 0) {
    cache.set("all", all);
    return all;
  }

  /* Fall back to last good cache. */
  const stale = cache.getStale("all");
  return stale ?? [];
}
