/* ─────────────────────────────────────────────────────────────
   Token Whale Tracker
   - Tracks $50K+ token transfers across top tradeable ERC20s
   - Classifies as BUY / SELL based on DEX + CEX counterparties
   - 6 chains via Etherscan v2 unified API
   - Last 24 hours, sorted by USD value
   - Uses wallet labels for human-readable counterparty names
   ───────────────────────────────────────────────────────────── */

import { TtlCache } from "./cache";
import {
  getWalletLabel,
  getWalletCategory,
  isMevWallet,
} from "./walletLabels";

const CACHE_TTL_MS = 90_000; // 90s — token transfer feeds change fast
const ETHERSCAN_V2_API = "https://api.etherscan.io/v2/api";
const REQUEST_TIMEOUT_MS = 12_000;
const MIN_USD_THRESHOLD = 50_000;
const LOOKBACK_MS = 24 * 60 * 60 * 1000; // 24 hours

export type TradeSide = "buy" | "sell";

export interface TokenTrade {
  id: string;
  side: TradeSide;
  /** Whale wallet (the non-CEX/non-DEX counterparty). */
  whaleAddress: string;
  whaleLabel?: string;
  /** True if the whale is a known MEV bot or MEV router. */
  isMev: boolean;
  /** Counterparty (CEX/DEX). */
  counterpartyAddress: string;
  counterpartyLabel: string;
  counterpartyType: "cex" | "dex";
  /** Token symbol, e.g. "LINK", "UNI", "PEPE". */
  symbol: string;
  /** Chain name, e.g. "Ethereum". */
  chain: string;
  chainId: number;
  /** Token amount in human units. */
  amount: number;
  /** USD value. */
  amountUsd: number;
  /** Transaction hash. */
  txHash: string;
  /** Block explorer URL for the wallet. */
  whaleExplorerUrl: string;
  /** Block explorer URL for the transaction. */
  txExplorerUrl: string;
  timestamp: number;
}

export interface TokenWhalesPayload {
  buys: TokenTrade[];
  sells: TokenTrade[];
  generatedAt: number;
  /** How many tokens we successfully scanned this cycle. */
  tokensScanned: number;
}

const cache = new TtlCache<TokenWhalesPayload>(CACHE_TTL_MS);

/* ═══════════════════════════════════════════════════════════ */
/* Token universe — top tradeable ERC20s across 6 chains       */
/* ═══════════════════════════════════════════════════════════ */

interface TrackedToken {
  symbol: string;
  /** CoinGecko ID for price lookup. */
  cgId: string;
  /** Per-chain contract addresses. */
  chains: Array<{
    chainId: number;
    chainName: string;
    contract: string;
    decimals: number;
    explorerBase: string; // e.g. "https://etherscan.io"
  }>;
}

const EXPLORER: Record<number, { name: string; base: string }> = {
  1: { name: "Ethereum", base: "https://etherscan.io" },
  56: { name: "BSC", base: "https://bscscan.com" },
  137: { name: "Polygon", base: "https://polygonscan.com" },
  42161: { name: "Arbitrum", base: "https://arbiscan.io" },
  10: { name: "Optimism", base: "https://optimistic.etherscan.io" },
  8453: { name: "Base", base: "https://basescan.org" },
};

/* Top tradeable ERC20-style tokens. We deliberately skip native L1 assets
   (BTC, ETH, BNB, SOL — the existing whale tracker handles those) and
   non-EVM tokens (SOL ecosystem, XRP, ADA, etc.).

   Selection criteria:
   - Top 60-ish by market cap that have ERC20/BEP20 form
   - At least 1 chain we already track
   - Liquid enough to see frequent $50K+ moves */

function exp(chainId: number) {
  const e = EXPLORER[chainId];
  return { chainId, chainName: e.name, explorerBase: e.base };
}

const TOKENS: TrackedToken[] = [
  /* Stablecoins — high volume, classify well */
  {
    symbol: "USDT", cgId: "tether",
    chains: [
      { ...exp(1),    contract: "0xdac17f958d2ee523a2206206994597c13d831ec7", decimals: 6 },
      { ...exp(56),   contract: "0x55d398326f99059ff775485246999027b3197955", decimals: 18 },
      { ...exp(137),  contract: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", decimals: 6 },
      { ...exp(42161),contract: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9", decimals: 6 },
      { ...exp(10),   contract: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58", decimals: 6 },
    ],
  },
  {
    symbol: "USDC", cgId: "usd-coin",
    chains: [
      { ...exp(1),    contract: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", decimals: 6 },
      { ...exp(56),   contract: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", decimals: 18 },
      { ...exp(137),  contract: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", decimals: 6 },
      { ...exp(42161),contract: "0xaf88d065e77c8cc2239327c5edb3a432268e5831", decimals: 6 },
      { ...exp(10),   contract: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", decimals: 6 },
      { ...exp(8453), contract: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", decimals: 6 },
    ],
  },
  /* Wrapped natives (often used as proxy for ETH/BTC trades) */
  {
    symbol: "WETH", cgId: "ethereum",
    chains: [
      { ...exp(1),    contract: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", decimals: 18 },
      { ...exp(42161),contract: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", decimals: 18 },
      { ...exp(10),   contract: "0x4200000000000000000000000000000000000006", decimals: 18 },
      { ...exp(8453), contract: "0x4200000000000000000000000000000000000006", decimals: 18 },
    ],
  },
  {
    symbol: "WBTC", cgId: "wrapped-bitcoin",
    chains: [
      { ...exp(1),    contract: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", decimals: 8 },
      { ...exp(42161),contract: "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f", decimals: 8 },
    ],
  },
  /* DeFi blue chips */
  {
    symbol: "LINK", cgId: "chainlink",
    chains: [
      { ...exp(1),    contract: "0x514910771af9ca656af840dff83e8264ecf986ca", decimals: 18 },
      { ...exp(56),   contract: "0xf8a0bf9cf54bb92f17374d9e9a321e6a111a51bd", decimals: 18 },
    ],
  },
  {
    symbol: "UNI", cgId: "uniswap",
    chains: [{ ...exp(1), contract: "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984", decimals: 18 }],
  },
  {
    symbol: "AAVE", cgId: "aave",
    chains: [{ ...exp(1), contract: "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9", decimals: 18 }],
  },
  {
    symbol: "MKR", cgId: "maker",
    chains: [{ ...exp(1), contract: "0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2", decimals: 18 }],
  },
  /* L1/L2 tokens with ERC20 form */
  {
    symbol: "MATIC", cgId: "matic-network",
    chains: [{ ...exp(1), contract: "0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0", decimals: 18 }],
  },
  {
    symbol: "ARB", cgId: "arbitrum",
    chains: [{ ...exp(42161), contract: "0x912ce59144191c1204e64559fe8253a0e49e6548", decimals: 18 }],
  },
  {
    symbol: "OP", cgId: "optimism",
    chains: [{ ...exp(10), contract: "0x4200000000000000000000000000000000000042", decimals: 18 }],
  },
  /* Memes (high whale activity) */
  {
    symbol: "PEPE", cgId: "pepe",
    chains: [{ ...exp(1), contract: "0x6982508145454ce325ddbe47a25d4ec3d2311933", decimals: 18 }],
  },
  {
    symbol: "SHIB", cgId: "shiba-inu",
    chains: [{ ...exp(1), contract: "0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce", decimals: 18 }],
  },
  /* Other liquid tokens */
  {
    symbol: "MNT", cgId: "mantle",
    chains: [{ ...exp(1), contract: "0x3c3a81e81dc49a522a592e7622a7e711c06bf354", decimals: 18 }],
  },
  {
    symbol: "RNDR", cgId: "render-token",
    chains: [{ ...exp(1), contract: "0x6de037ef9ad2725eb40118bb1702ebb27e4aeb24", decimals: 18 }],
  },
  {
    symbol: "INJ", cgId: "injective-protocol",
    chains: [{ ...exp(1), contract: "0xe28b3b32b6c345a34ff64674606124dd5aceca30", decimals: 18 }],
  },
  {
    symbol: "LDO", cgId: "lido-dao",
    chains: [{ ...exp(1), contract: "0x5a98fcbea516cf06857215779fd812ca3bef1b32", decimals: 18 }],
  },
  {
    symbol: "STETH", cgId: "staked-ether",
    chains: [{ ...exp(1), contract: "0xae7ab96520de3a18e5e111b5eaab095312d7fe84", decimals: 18 }],
  },
  {
    symbol: "CRO", cgId: "crypto-com-chain",
    chains: [{ ...exp(1), contract: "0xa0b73e1ff0b80914ab6fe0444e65848c4c34450b", decimals: 8 }],
  },
];

/* ═══════════════════════════════════════════════════════════ */
/* Price fetching                                              */
/* ═══════════════════════════════════════════════════════════ */

interface PriceMap {
  [cgId: string]: number;
}

async function fetchPrices(): Promise<PriceMap> {
  const cgKey = process.env.COINGECKO_API_KEY;
  const ids = TOKENS.map((t) => t.cgId).join(",");
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (cgKey) headers["x-cg-demo-api-key"] = cgKey;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) return {};
    const json = await res.json();
    if (typeof json !== "object" || json === null) return {};
    const out: PriceMap = {};
    for (const [id, val] of Object.entries(json as Record<string, { usd?: number }>)) {
      if (val?.usd && val.usd > 0) out[id] = val.usd;
    }
    return out;
  } catch {
    return {};
  } finally {
    clearTimeout(timer);
  }
}

/* ═══════════════════════════════════════════════════════════ */
/* Etherscan token transfer fetching                           */
/* ═══════════════════════════════════════════════════════════ */

interface EtherscanTokenTx {
  hash?: string;
  blockNumber?: string;
  timeStamp?: string;
  from?: string;
  to?: string;
  value?: string;
  contractAddress?: string;
}

interface EtherscanResp {
  status?: string;
  result?: EtherscanTokenTx[] | string;
}

/**
 * Fetch token transfers FOR A SPECIFIC TOKEN CONTRACT, restricted to ones
 * involving a known DEX or CEX. We query Etherscan's tokentx action with
 * the contract address as a filter, then post-filter for known counterparties.
 *
 * Strategy: query the latest ~10000 transfers for this token (Etherscan
 * returns up to 10000 in one call), filter to last 24h + counterparty match.
 */
async function fetchTokenTransfersForChain(
  apiKey: string,
  chainId: number,
  contract: string,
): Promise<EtherscanTokenTx[]> {
  const url =
    `${ETHERSCAN_V2_API}?chainid=${chainId}` +
    `&module=account&action=tokentx` +
    `&contractaddress=${contract}` +
    `&page=1&offset=1000&sort=desc&apikey=${apiKey}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as EtherscanResp;
    if (json.status !== "1" || !Array.isArray(json.result)) return [];
    return json.result;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/* ═══════════════════════════════════════════════════════════ */
/* Classification + assembly                                   */
/* ═══════════════════════════════════════════════════════════ */

/**
 * Classify a token transfer.
 *
 * The strict CEX-vs-DEX classifier was too narrow because Etherscan's
 * tokentx endpoint reports transfers at the POOL level, not the router
 * level. Pool/pair contracts are not in our label set (there are
 * thousands of them, one per token pair × fee tier), so the strict
 * filter rejected most real swap activity.
 *
 * New approach: surface ALL $50K+ transfers, but tag them based on
 * counterparty patterns so the user can still see signal:
 *
 *   - From = known CEX  → "buy"  (user withdrew tokens after buying)
 *   - To   = known CEX  → "sell" (user deposited tokens, usually to sell)
 *   - From = MEV bot    → "buy"  (MEV bot got tokens, often after extraction)
 *   - To   = MEV bot    → "sell" (someone sent tokens to a known MEV operator)
 *   - From-side address looks contract-y AND high-frequency in this fetch
 *     → likely a DEX pool  → tag as "swap" (treat as buy if to is EOA)
 *   - Otherwise → "transfer" (still shown — wallet-to-wallet movement
 *     of $50K+ is informative even without buy/sell semantics)
 *
 * We never skip a transfer over threshold. Worst case it shows up as
 * a generic transfer. The user can still see the wallets, the amount,
 * and click through to the explorer.
 */
function classify(
  chainId: number,
  from: string,
  to: string,
  highFreqAddresses: Set<string>,
): {
  side: TradeSide;
  whale: string;
  counterparty: string;
  cpType: "cex" | "dex" | "mev" | "pool" | "transfer";
  cpFallbackLabel: string;
} {
  const fromCat = getWalletCategory(chainId, from);
  const toCat = getWalletCategory(chainId, to);

  /* CEX-driven trades — strongest signal. */
  if (fromCat === "cex") {
    return {
      side: "buy",
      whale: to,
      counterparty: from,
      cpType: "cex",
      cpFallbackLabel: "CEX",
    };
  }
  if (toCat === "cex") {
    return {
      side: "sell",
      whale: from,
      counterparty: to,
      cpType: "cex",
      cpFallbackLabel: "CEX",
    };
  }

  /* MEV-side trades — show but mark distinctly. */
  if (fromCat === "mev") {
    return {
      side: "buy",
      whale: to,
      counterparty: from,
      cpType: "mev",
      cpFallbackLabel: "MEV bot",
    };
  }
  if (toCat === "mev") {
    return {
      side: "sell",
      whale: from,
      counterparty: to,
      cpType: "mev",
      cpFallbackLabel: "MEV bot",
    };
  }

  /* Known DEX router (rare in tokentx, but possible for some routers). */
  if (fromCat === "dex") {
    return {
      side: "buy",
      whale: to,
      counterparty: from,
      cpType: "dex",
      cpFallbackLabel: "DEX router",
    };
  }
  if (toCat === "dex") {
    return {
      side: "sell",
      whale: from,
      counterparty: to,
      cpType: "dex",
      cpFallbackLabel: "DEX router",
    };
  }

  /* Heuristic: high-frequency endpoint in this fetch is almost
     certainly a pool/aggregator/contract. Use it as the counterparty
     and treat the other side as the whale. */
  const fromHighFreq = highFreqAddresses.has(from);
  const toHighFreq = highFreqAddresses.has(to);
  if (fromHighFreq && !toHighFreq) {
    return {
      side: "buy",
      whale: to,
      counterparty: from,
      cpType: "pool",
      cpFallbackLabel: "DEX pool",
    };
  }
  if (toHighFreq && !fromHighFreq) {
    return {
      side: "sell",
      whale: from,
      counterparty: to,
      cpType: "pool",
      cpFallbackLabel: "DEX pool",
    };
  }
  /* Both sides are high-frequency or both are low-frequency — treat
     as wallet-to-wallet transfer. We arbitrarily make `from` the whale
     and `to` the counterparty so it sorts into the "sell" pile. */
  return {
    side: "sell",
    whale: from,
    counterparty: to,
    cpType: "transfer",
    cpFallbackLabel: "Wallet",
  };
}

function processTransfers(
  transfers: EtherscanTokenTx[],
  token: TrackedToken,
  chain: TrackedToken["chains"][0],
  priceUsd: number,
  cutoffTs: number,
): TokenTrade[] {
  /* First pass: count address frequency in this batch so we can
     identify likely pool/contract addresses. Anything appearing 5+
     times as either from or to is treated as infrastructure. */
  const addressFreq = new Map<string, number>();
  for (const tx of transfers) {
    if (tx.from) {
      const f = tx.from.toLowerCase();
      addressFreq.set(f, (addressFreq.get(f) ?? 0) + 1);
    }
    if (tx.to) {
      const t = tx.to.toLowerCase();
      addressFreq.set(t, (addressFreq.get(t) ?? 0) + 1);
    }
  }
  const HIGH_FREQ_THRESHOLD = 5;
  const highFreqAddresses = new Set<string>();
  for (const [addr, count] of addressFreq.entries()) {
    if (count >= HIGH_FREQ_THRESHOLD) highFreqAddresses.add(addr);
  }

  const out: TokenTrade[] = [];
  for (const tx of transfers) {
    const ts = parseInt(tx.timeStamp ?? "0", 10) * 1000;
    if (!Number.isFinite(ts) || ts < cutoffTs) continue;

    const from = (tx.from ?? "").toLowerCase();
    const to = (tx.to ?? "").toLowerCase();
    if (!from || !to || !tx.value || !tx.hash) continue;

    /* Skip null-address mints/burns (USDT/USDC issuance), they're
       not real market activity. */
    if (
      from === "0x0000000000000000000000000000000000000000" ||
      to === "0x0000000000000000000000000000000000000000"
    ) {
      continue;
    }

    /* Compute USD value first — most rows fail the threshold and
       we save downstream work. */
    let amount: number;
    try {
      const rawValue = BigInt(tx.value);
      const divisor = BigInt(10) ** BigInt(chain.decimals);
      const wholePart = Number(rawValue / divisor);
      const fracPart = Number(rawValue % divisor) / Number(divisor);
      amount = wholePart + fracPart;
    } catch {
      continue;
    }
    const amountUsd = amount * priceUsd;
    if (amountUsd < MIN_USD_THRESHOLD) continue;

    /* Classify with the broader heuristic. */
    const c = classify(chain.chainId, from, to, highFreqAddresses);

    /* Check both sides for MEV — sometimes the bot is the
       counterparty rather than the whale. */
    const whaleIsMev = isMevWallet(chain.chainId, c.whale);
    const counterpartyIsMev = isMevWallet(chain.chainId, c.counterparty);
    const isMev = whaleIsMev || counterpartyIsMev;

    const cpLabel = getWalletLabel(chain.chainId, c.counterparty);
    const whaleLabel = getWalletLabel(chain.chainId, c.whale);

    /* Map our extended cpType to the public-facing one ("cex" or "dex"
       only — UI consumers don't care about the internal distinction). */
    const publicCpType: "cex" | "dex" =
      c.cpType === "cex" ? "cex" : "dex";

    out.push({
      id: `${tx.hash}-${c.side}-${chain.chainId}`,
      side: c.side,
      whaleAddress: c.whale,
      whaleLabel: whaleLabel?.label,
      isMev,
      counterpartyAddress: c.counterparty,
      counterpartyLabel: cpLabel?.label ?? c.cpFallbackLabel,
      counterpartyType: publicCpType,
      symbol: token.symbol,
      chain: chain.chainName,
      chainId: chain.chainId,
      amount,
      amountUsd,
      txHash: tx.hash,
      whaleExplorerUrl: `${chain.explorerBase}/address/${c.whale}`,
      txExplorerUrl: `${chain.explorerBase}/tx/${tx.hash}`,
      timestamp: ts,
    });
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════ */
/* Top-level fetcher                                           */
/* ═══════════════════════════════════════════════════════════ */

export async function fetchTokenWhales(): Promise<TokenWhalesPayload> {
  const cached = cache.get("payload");
  if (cached) return cached;

  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) {
    return {
      buys: [],
      sells: [],
      generatedAt: Date.now(),
      tokensScanned: 0,
    };
  }

  const prices = await fetchPrices();
  const cutoffTs = Date.now() - LOOKBACK_MS;

  /* Build the list of (token, chain) pairs to fetch.
     Total request count = sum over all tokens of their chain count.
     For our universe: ~30 calls per refresh, cached 90s = 1200/day = well
     under Etherscan's 100k/day daily limit. We also throttle to 5
     calls/sec to respect the free-tier rate cap. */
  type Task = () => Promise<TokenTrade[]>;
  const tasks: Task[] = [];
  let scannedCount = 0;

  for (const token of TOKENS) {
    const price = prices[token.cgId];
    if (!price || price <= 0) continue;
    for (const chain of token.chains) {
      scannedCount++;
      tasks.push(async () => {
        const txs = await fetchTokenTransfersForChain(
          apiKey,
          chain.chainId,
          chain.contract,
        );
        return processTransfers(txs, token, chain, price, cutoffTs);
      });
    }
  }

  /* Throttle to 5 concurrent requests at a time. With 30 tasks this
     finishes in ~6 sequential batches over ~2-3 seconds — well inside
     the function's 60-second timeout. */
  const CONCURRENCY = 5;
  const allTrades: TokenTrade[] = [];
  for (let i = 0; i < tasks.length; i += CONCURRENCY) {
    const batch = tasks.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map((t) => t()));
    for (const r of results) {
      for (const trade of r) allTrades.push(trade);
    }
    /* Small breather between batches to avoid the 5/sec cap when
       Etherscan counts batches in tight windows. */
    if (i + CONCURRENCY < tasks.length) {
      await new Promise((res) => setTimeout(res, 250));
    }
  }

  /* Split into buys and sells, sort by USD desc. */
  const buys = allTrades
    .filter((t) => t.side === "buy")
    .sort((a, b) => b.amountUsd - a.amountUsd)
    .slice(0, 50);
  const sells = allTrades
    .filter((t) => t.side === "sell")
    .sort((a, b) => b.amountUsd - a.amountUsd)
    .slice(0, 50);

  const payload: TokenWhalesPayload = {
    buys,
    sells,
    generatedAt: Date.now(),
    tokensScanned: scannedCount,
  };

  /* Only cache successes — empty results may be transient. */
  if (allTrades.length > 0) {
    cache.set("payload", payload);
  }
  return payload;
}
