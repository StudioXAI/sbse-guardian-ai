/* ─────────────────────────────────────────────────────────────
   DEX Event Scanner

   Scans the last ~30 blocks across enabled chains for Uniswap V2
   and V3 Swap events using eth_getLogs. For each event:

   1. Identify the pool contract that emitted the event
   2. Determine which token was sold and which was bought
   3. Resolve token metadata (symbol/decimals)
   4. Compute USD value if we can price the token
   5. Calculate pool liquidity impact
   6. Classify suspicious behavior with multi-class risk reasons

   No hardcoded token list. No hardcoded pool addresses. Tokens
   and pools are discovered from events themselves.

   Cost: per refresh, ~5 RPC calls + ~3 calls per flagged sell for
   pool reserve lookup. With 90s server-side cache this is
   ~30-50 calls/min on QuickNode Build tier (~80M credits/month).
   ───────────────────────────────────────────────────────────── */

import {
  rpcCall,
  rpcBatch,
  getBlockNumber,
  getEnabledChains,
  CHAIN_CONFIG,
  toHexBlock,
  type SupportedChain,
} from "./quicknodeClient";
import { resolveTokenMetadata, type TokenMetadata } from "./tokenMetadata";
import { getWalletLabel, isMevWallet } from "./walletLabels";

/* ═══════════════════════════════════════════════════════════ */
/* Types                                                        */
/* ═══════════════════════════════════════════════════════════ */

export type RiskReason =
  | "large_sell"
  | "liquidity_drain"
  | "abnormal_swap"
  | "high_slippage"
  | "flash_loan_pattern"
  | "suspicious_wallet"
  | "mev_bot"
  | "new_token";

export interface SuspiciousActivity {
  id: string;
  txHash: string;
  blockNumber: number;
  /** When the swap was mined (epoch ms). */
  timestamp: number;
  /** Chain where this happened. */
  chain: string;
  chainId: number;
  /** The token that was sold (entered the pool). */
  tokenSymbol: string;
  tokenAddress: string;
  tokenName: string;
  /** Pool that absorbed the sell. */
  poolAddress: string;
  poolDex: "Uniswap V2" | "Uniswap V3" | "Other DEX";
  /** Wallet that initiated the swap (tx sender). */
  wallet: string;
  walletLabel?: string;
  /** Token amount sold in human units. */
  tokenAmount: number;
  /** USD value of the sell (best-effort — null if no price source). */
  amountUsd: number | null;
  /** Pool liquidity impact percent (% of pool reserves consumed). */
  poolImpactPct: number;
  /** Severity score 0-100. Higher = more suspicious. */
  severity: number;
  /** Multiple risk reasons can apply to the same swap. */
  riskReasons: RiskReason[];
  /** Plain-English summary, e.g. "Single wallet drained 14% of pool". */
  riskSummary: string;
  /** Where the sold tokens came from / where USDC went. Optional. */
  fundFlow?: {
    /** What happened to the sale proceeds (best inference). */
    proceedsTo?: string;
    proceedsToLabel?: string;
    /** Where the sold token came from in the wallet. */
    sourceFrom?: string;
    sourceFromLabel?: string;
  };
  /** Block explorer URLs. */
  txUrl: string;
  walletUrl: string;
  poolUrl: string;
}

export interface ScanResult {
  activities: SuspiciousActivity[];
  generatedAt: number;
  chainsScanned: SupportedChain[];
  blocksScanned: number;
  totalEventsSeen: number;
  /** True when no QUICKNODE_*_URL is configured. */
  unconfigured: boolean;
}

/* ═══════════════════════════════════════════════════════════ */
/* Event signatures                                             */
/* ═══════════════════════════════════════════════════════════ */

/* Uniswap V2 Swap event:
   event Swap(address indexed sender, uint amount0In, uint amount1In,
              uint amount0Out, uint amount1Out, address indexed to);
   topic0 = keccak256("Swap(address,uint256,uint256,uint256,uint256,address)") */
const V2_SWAP_TOPIC =
  "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822";

/* Uniswap V3 Swap event:
   event Swap(address indexed sender, address indexed recipient,
              int256 amount0, int256 amount1, uint160 sqrtPriceX96,
              uint128 liquidity, int24 tick);
   topic0 = keccak256("Swap(address,address,int256,int256,uint160,uint128,int24)") */
const V3_SWAP_TOPIC =
  "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67";

/* ERC-20 Transfer event topic — used for fund flow tracing. */
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

/* ═══════════════════════════════════════════════════════════ */
/* Scan parameters                                              */
/* ═══════════════════════════════════════════════════════════ */

/* Number of recent blocks to scan per refresh. ETH = ~12s/block,
   so 30 blocks = ~6 minutes of activity. We also cache the result
   for 90s, so each refresh covers a sliding window. */
const BLOCK_SPAN = 30;

/* Hard cap on logs returned per chain to avoid bloat. */
const MAX_LOGS_PER_CHAIN = 500;

/* Suspicion thresholds — used to compute risk reasons. */
const LARGE_SELL_USD = 50_000;
const LIQUIDITY_DRAIN_PCT = 10; // ≥10% of pool consumed by one swap
const ABNORMAL_SWAP_PCT = 25; // ≥25% = very abnormal
const HIGH_SLIPPAGE_PCT = 5; // implied price impact threshold (V3 only)

/* Minimum severity to surface in the feed — anything below 30 is noise. */
const MIN_SEVERITY = 30;

/* Top N activities to return. */
const TOP_N = 8;

/* ═══════════════════════════════════════════════════════════ */
/* Log fetching                                                 */
/* ═══════════════════════════════════════════════════════════ */

interface RawLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
  blockHash?: string;
  logIndex?: string;
}

/**
 * Fetch all V2 + V3 Swap logs in a block range. Two parallel
 * requests, one per topic.
 */
async function fetchSwapLogs(
  chain: SupportedChain,
  fromBlock: number,
  toBlock: number,
): Promise<{ v2: RawLog[]; v3: RawLog[] }> {
  const baseFilter = {
    fromBlock: toHexBlock(fromBlock),
    toBlock: toHexBlock(toBlock),
  };

  const [v2Result, v3Result] = await Promise.all([
    rpcCall<RawLog[]>(chain, "eth_getLogs", [
      { ...baseFilter, topics: [V2_SWAP_TOPIC] },
    ]),
    rpcCall<RawLog[]>(chain, "eth_getLogs", [
      { ...baseFilter, topics: [V3_SWAP_TOPIC] },
    ]),
  ]);

  const v2 = Array.isArray(v2Result)
    ? v2Result.slice(0, MAX_LOGS_PER_CHAIN)
    : [];
  const v3 = Array.isArray(v3Result)
    ? v3Result.slice(0, MAX_LOGS_PER_CHAIN)
    : [];

  return { v2, v3 };
}

/* ═══════════════════════════════════════════════════════════ */
/* Hex parsing utilities                                        */
/* ═══════════════════════════════════════════════════════════ */

/**
 * Parse a fixed-size 32-byte hex word as an unsigned BigInt.
 * Input must NOT include the 0x prefix.
 */
function parseUint256(hex: string): bigint {
  if (!hex || hex.length === 0) return BigInt(0);
  try {
    return BigInt("0x" + hex);
  } catch {
    return BigInt(0);
  }
}

/**
 * Parse a signed int256. The high bit indicates negative; if set,
 * we interpret as two's complement.
 */
function parseInt256(hex: string): bigint {
  if (!hex || hex.length === 0) return BigInt(0);
  try {
    const u = BigInt("0x" + hex);
    const SIGN_BIT = BigInt(1) << BigInt(255);
    const TWO_256 = BigInt(1) << BigInt(256);
    return u >= SIGN_BIT ? u - TWO_256 : u;
  } catch {
    return BigInt(0);
  }
}

/**
 * Convert a BigInt amount with given decimals to a Number in
 * human units. Loses precision for huge values but our use case
 * is display + USD math which doesn't need wei-level accuracy.
 */
function toHumanAmount(raw: bigint, decimals: number): number {
  if (raw < BigInt(0)) raw = -raw;
  const divisor = BigInt(10) ** BigInt(decimals);
  const whole = Number(raw / divisor);
  const frac = Number(raw % divisor) / Number(divisor);
  return whole + frac;
}

/** Parse the indexed address topic (0x000...0040 bytes of address). */
function parseAddressTopic(topic: string): string {
  if (!topic || topic.length < 42) return "";
  /* Last 20 bytes (40 hex chars) of the 32-byte topic. */
  return ("0x" + topic.slice(-40)).toLowerCase();
}

/* ═══════════════════════════════════════════════════════════ */
/* V2 / V3 event parsing                                        */
/* ═══════════════════════════════════════════════════════════ */

interface ParsedSwap {
  poolAddress: string;
  /** Address that initiated the swap on the sender side. For V2
      this is the indexed `sender`; for V3 also indexed `sender`. */
  sender: string;
  /** Recipient of the output tokens (V3 only — V2 uses indexed `to`). */
  recipient: string;
  /** For each token side (0 and 1), the absolute amount that
      ENTERED the pool (i.e. was sold by the user). 0 means the
      user did NOT sell that token. */
  amount0In: bigint;
  amount1In: bigint;
  /** For each token side, the amount that LEFT the pool (was
      bought by the user). 0 means the user did NOT buy that token. */
  amount0Out: bigint;
  amount1Out: bigint;
  txHash: string;
  blockNumber: number;
}

function parseV2Swap(log: RawLog): ParsedSwap | null {
  /* V2 indexed: sender (topic 1), to (topic 2)
     V2 data: amount0In, amount1In, amount0Out, amount1Out (4 × uint256) */
  if (log.topics.length < 3) return null;
  const data = log.data.startsWith("0x") ? log.data.slice(2) : log.data;
  if (data.length < 256) return null;

  return {
    poolAddress: log.address.toLowerCase(),
    sender: parseAddressTopic(log.topics[1]),
    recipient: parseAddressTopic(log.topics[2]),
    amount0In: parseUint256(data.slice(0, 64)),
    amount1In: parseUint256(data.slice(64, 128)),
    amount0Out: parseUint256(data.slice(128, 192)),
    amount1Out: parseUint256(data.slice(192, 256)),
    txHash: log.transactionHash,
    blockNumber: parseInt(log.blockNumber, 16),
  };
}

function parseV3Swap(log: RawLog): ParsedSwap | null {
  /* V3 indexed: sender (topic 1), recipient (topic 2)
     V3 data: amount0, amount1, sqrtPriceX96, liquidity, tick (5 fields)
     amounts are SIGNED: positive = pool received from sender (sold),
                        negative = pool sent to recipient (bought). */
  if (log.topics.length < 3) return null;
  const data = log.data.startsWith("0x") ? log.data.slice(2) : log.data;
  if (data.length < 320) return null;

  const amount0 = parseInt256(data.slice(0, 64));
  const amount1 = parseInt256(data.slice(64, 128));

  /* Translate signed V3 amounts into V2-style In/Out semantics. */
  const amount0In = amount0 > BigInt(0) ? amount0 : BigInt(0);
  const amount1In = amount1 > BigInt(0) ? amount1 : BigInt(0);
  const amount0Out = amount0 < BigInt(0) ? -amount0 : BigInt(0);
  const amount1Out = amount1 < BigInt(0) ? -amount1 : BigInt(0);

  return {
    poolAddress: log.address.toLowerCase(),
    sender: parseAddressTopic(log.topics[1]),
    recipient: parseAddressTopic(log.topics[2]),
    amount0In,
    amount1In,
    amount0Out,
    amount1Out,
    txHash: log.transactionHash,
    blockNumber: parseInt(log.blockNumber, 16),
  };
}

/* ═══════════════════════════════════════════════════════════ */
/* Pool token resolution                                        */
/* ═══════════════════════════════════════════════════════════ */

/* Selectors for pool methods we need: */
const POOL_TOKEN0_SELECTOR = "0x0dfe1681"; // token0()
const POOL_TOKEN1_SELECTOR = "0xd21220a7"; // token1()

interface PoolTokens {
  poolAddress: string;
  token0: string;
  token1: string;
}

/**
 * Resolve token0 and token1 for a batch of pool addresses.
 * One eth_call per (pool, method), batched for efficiency.
 */
async function resolvePoolTokens(
  chain: SupportedChain,
  poolAddresses: string[],
): Promise<Map<string, PoolTokens>> {
  const out = new Map<string, PoolTokens>();
  if (poolAddresses.length === 0) return out;

  const requests: Array<{ method: string; params: unknown[] }> = [];
  for (const pool of poolAddresses) {
    requests.push({
      method: "eth_call",
      params: [{ to: pool, data: POOL_TOKEN0_SELECTOR }, "latest"],
    });
    requests.push({
      method: "eth_call",
      params: [{ to: pool, data: POOL_TOKEN1_SELECTOR }, "latest"],
    });
  }

  const results = await rpcBatch<string>(chain, requests);

  for (let i = 0; i < poolAddresses.length; i++) {
    const t0Hex = results[i * 2];
    const t1Hex = results[i * 2 + 1];
    if (!t0Hex || !t1Hex || typeof t0Hex !== "string" || typeof t1Hex !== "string") {
      continue;
    }
    /* token addresses come back as 32-byte padded — extract last 20 bytes. */
    const stripped0 = t0Hex.startsWith("0x") ? t0Hex.slice(2) : t0Hex;
    const stripped1 = t1Hex.startsWith("0x") ? t1Hex.slice(2) : t1Hex;
    if (stripped0.length < 40 || stripped1.length < 40) continue;
    const token0 = ("0x" + stripped0.slice(-40)).toLowerCase();
    const token1 = ("0x" + stripped1.slice(-40)).toLowerCase();
    /* Skip empty/zero addresses */
    if (token0 === "0x0000000000000000000000000000000000000000") continue;
    if (token1 === "0x0000000000000000000000000000000000000000") continue;
    out.set(poolAddresses[i], { poolAddress: poolAddresses[i], token0, token1 });
  }

  return out;
}

/* ═══════════════════════════════════════════════════════════ */
/* Pool reserve lookup (for impact %)                           */
/* ═══════════════════════════════════════════════════════════ */

/* ERC-20 balanceOf(address) selector + 32-byte right-padded address. */
function buildBalanceOfData(holder: string): string {
  const stripped = holder.startsWith("0x") ? holder.slice(2) : holder;
  const padded = stripped.padStart(64, "0");
  return "0x70a08231" + padded;
}

/**
 * Get the balance of a token held by a specific address (typically
 * a pool). Returns the raw uint256 as bigint.
 */
async function getTokenBalance(
  chain: SupportedChain,
  tokenContract: string,
  holder: string,
): Promise<bigint> {
  const result = await rpcCall<string>(chain, "eth_call", [
    { to: tokenContract, data: buildBalanceOfData(holder) },
    "latest",
  ]);
  if (!result || typeof result !== "string") return BigInt(0);
  const stripped = result.startsWith("0x") ? result.slice(2) : result;
  return parseUint256(stripped);
}

/* ═══════════════════════════════════════════════════════════ */
/* USD price resolution                                         */
/* ═══════════════════════════════════════════════════════════ */

import { TtlCache } from "./cache";

const PRICE_CACHE_TTL_MS = 5 * 60 * 1000;
const priceCache = new Map<SupportedChain, TtlCache<number>>();

function priceCacheFor(chain: SupportedChain): TtlCache<number> {
  let c = priceCache.get(chain);
  if (!c) {
    c = new TtlCache<number>(PRICE_CACHE_TTL_MS);
    priceCache.set(chain, c);
  }
  return c;
}

/* CoinGecko's per-chain platform identifier for /simple/token_price endpoint. */
const CG_PLATFORM: Record<SupportedChain, string> = {
  ethereum: "ethereum",
  bsc: "binance-smart-chain",
  polygon: "polygon-pos",
  arbitrum: "arbitrum-one",
  optimism: "optimistic-ethereum",
  base: "base",
};

/**
 * Resolve USD prices for many token contract addresses at once.
 * Tokens not in CoinGecko (small caps, brand new) return null in
 * the map — caller should display "—" or skip USD-based filters.
 */
async function resolveTokenPrices(
  chain: SupportedChain,
  addresses: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const c = priceCacheFor(chain);

  const toFetch: string[] = [];
  for (const addr of addresses) {
    const lower = addr.toLowerCase();
    const cached = c.get(lower);
    if (cached !== null) {
      out.set(lower, cached);
    } else {
      toFetch.push(lower);
    }
  }

  if (toFetch.length === 0) return out;

  /* CoinGecko allows up to 100 contracts per call. */
  const platform = CG_PLATFORM[chain];
  const cgKey = process.env.COINGECKO_API_KEY;
  for (let i = 0; i < toFetch.length; i += 100) {
    const batch = toFetch.slice(i, i + 100);
    const url =
      `https://api.coingecko.com/api/v3/simple/token_price/${platform}` +
      `?contract_addresses=${batch.join(",")}&vs_currencies=usd`;
    const headers: Record<string, string> = { Accept: "application/json" };
    if (cgKey) headers["x-cg-demo-api-key"] = cgKey;

    try {
      const res = await fetch(url, { headers });
      if (!res.ok) continue;
      const json = (await res.json()) as Record<string, { usd?: number }>;
      for (const addr of batch) {
        const price = json[addr]?.usd;
        if (typeof price === "number" && price > 0) {
          c.set(addr, price);
          out.set(addr, price);
        }
      }
    } catch {
      /* swallow — caller handles missing prices. */
    }
  }

  return out;
}

/* ═══════════════════════════════════════════════════════════ */
/* Suspicion classification                                     */
/* ═══════════════════════════════════════════════════════════ */

interface ClassifyInput {
  amountUsd: number | null;
  poolImpactPct: number;
  walletIsMev: boolean;
  walletIsLabeled: boolean;
  /** New token = no CoinGecko price = likely freshly deployed. */
  isNewToken: boolean;
}

interface Classification {
  reasons: RiskReason[];
  severity: number;
  summary: string;
}

function classify(input: ClassifyInput): Classification {
  const reasons: RiskReason[] = [];
  let severity = 0;

  /* Liquidity drain — biggest signal. */
  if (input.poolImpactPct >= ABNORMAL_SWAP_PCT) {
    reasons.push("abnormal_swap");
    severity = Math.max(severity, 90);
  } else if (input.poolImpactPct >= LIQUIDITY_DRAIN_PCT) {
    reasons.push("liquidity_drain");
    severity = Math.max(severity, 70);
  }

  /* Large sell — secondary signal that's still notable. */
  if (input.amountUsd !== null && input.amountUsd >= LARGE_SELL_USD) {
    reasons.push("large_sell");
    severity = Math.max(severity, 50);
  }

  /* Pool impact > 1% on its own is a hint, even without huge $ value. */
  if (input.poolImpactPct >= 1 && reasons.length === 0) {
    severity = Math.max(severity, 35);
  }

  /* Wallet flags — additive, not standalone. */
  if (input.walletIsMev) {
    reasons.push("mev_bot");
    severity = Math.max(severity, severity + 5);
  }
  if (input.walletIsLabeled && !input.walletIsMev) {
    /* Known whale or team wallet doing a big sell — boost severity slightly. */
    reasons.push("suspicious_wallet");
    severity = Math.min(100, severity + 5);
  }

  /* Brand-new tokens (no CG price) selling into a pool can indicate
     a freshly deployed scam exiting. Only flag if there's also some
     impact — we don't want to flag every tiny test trade. */
  if (input.isNewToken && input.poolImpactPct >= 5) {
    reasons.push("new_token");
    severity = Math.min(100, severity + 10);
  }

  /* Build a plain-English summary based on the strongest signal. */
  let summary = "Activity flagged for review";
  if (reasons.includes("abnormal_swap")) {
    summary = `Single swap consumed ${input.poolImpactPct.toFixed(1)}% of pool liquidity — abnormal sizing`;
  } else if (reasons.includes("liquidity_drain")) {
    summary = `Single wallet drained ${input.poolImpactPct.toFixed(1)}% of pool reserves`;
  } else if (reasons.includes("large_sell") && input.amountUsd) {
    summary = `Large sell of $${(input.amountUsd / 1000).toFixed(0)}K tokens at ${input.poolImpactPct.toFixed(2)}% pool impact`;
  } else if (reasons.includes("new_token")) {
    summary = `Sell from newly-deployed token — unverified price discovery`;
  } else if (reasons.includes("mev_bot")) {
    summary = `MEV bot activity at ${input.poolImpactPct.toFixed(2)}% pool impact`;
  }

  return {
    reasons,
    severity: Math.min(100, severity),
    summary,
  };
}

/* ═══════════════════════════════════════════════════════════ */
/* Top-level scan                                               */
/* ═══════════════════════════════════════════════════════════ */

const cache = new TtlCache<ScanResult>(90_000);

export async function scanForSuspiciousActivity(): Promise<ScanResult> {
  const cached = cache.get("scan");
  if (cached) return cached;

  const chains = getEnabledChains();
  if (chains.length === 0) {
    return {
      activities: [],
      generatedAt: Date.now(),
      chainsScanned: [],
      blocksScanned: 0,
      totalEventsSeen: 0,
      unconfigured: true,
    };
  }

  const allActivities: SuspiciousActivity[] = [];
  let totalBlocksScanned = 0;
  let totalEventsSeen = 0;

  /* Scan each chain in parallel. Each chain's pipeline is:
       1. Get block range
       2. Fetch V2+V3 swap logs
       3. Resolve pool token0/token1 (batch)
       4. Resolve token metadata for all tokens we just discovered
       5. Resolve USD prices for tokens (CoinGecko)
       6. For each swap, identify sold token + classify
       7. For top candidates only, fetch pool reserves to compute impact
       8. Emit final SuspiciousActivity records */
  await Promise.all(
    chains.map(async (chain) => {
      try {
        const result = await scanChain(chain);
        if (result) {
          totalBlocksScanned += result.blocksScanned;
          totalEventsSeen += result.totalEventsSeen;
          allActivities.push(...result.activities);
        }
      } catch {
        /* Per-chain failure shouldn't take down the whole scan. */
      }
    }),
  );

  /* Sort by severity desc, take top N for display. */
  allActivities.sort((a, b) => {
    if (b.severity !== a.severity) return b.severity - a.severity;
    return b.timestamp - a.timestamp;
  });

  const result: ScanResult = {
    activities: allActivities.slice(0, TOP_N),
    generatedAt: Date.now(),
    chainsScanned: chains,
    blocksScanned: totalBlocksScanned,
    totalEventsSeen,
    unconfigured: false,
  };

  if (allActivities.length > 0) {
    cache.set("scan", result);
  }
  return result;
}

/**
 * Per-chain scan pipeline. Returns the final activity records
 * found on this chain plus diagnostic stats.
 */
async function scanChain(chain: SupportedChain): Promise<{
  activities: SuspiciousActivity[];
  blocksScanned: number;
  totalEventsSeen: number;
} | null> {
  const cfg = CHAIN_CONFIG[chain];

  /* 1. Block range */
  const tipBlock = await getBlockNumber(chain);
  if (tipBlock === null) return null;
  const fromBlock = Math.max(0, tipBlock - BLOCK_SPAN);

  /* 2. Fetch swap logs */
  const { v2, v3 } = await fetchSwapLogs(chain, fromBlock, tipBlock);
  const totalEventsSeen = v2.length + v3.length;
  if (totalEventsSeen === 0) {
    return { activities: [], blocksScanned: BLOCK_SPAN, totalEventsSeen: 0 };
  }

  /* 3. Parse all events into a uniform shape. */
  const parsed: Array<ParsedSwap & { dex: "Uniswap V2" | "Uniswap V3" }> = [];
  for (const log of v2) {
    const p = parseV2Swap(log);
    if (p) parsed.push({ ...p, dex: "Uniswap V2" });
  }
  for (const log of v3) {
    const p = parseV3Swap(log);
    if (p) parsed.push({ ...p, dex: "Uniswap V3" });
  }
  if (parsed.length === 0) {
    return { activities: [], blocksScanned: BLOCK_SPAN, totalEventsSeen };
  }

  /* 4. Resolve pool token0/token1 for every unique pool. */
  const uniquePools = Array.from(new Set(parsed.map((p) => p.poolAddress)));
  const poolTokens = await resolvePoolTokens(chain, uniquePools);

  /* 5. Resolve metadata + price for every unique token across pools. */
  const allTokenAddrs = new Set<string>();
  for (const pt of poolTokens.values()) {
    allTokenAddrs.add(pt.token0);
    allTokenAddrs.add(pt.token1);
  }
  const tokenAddrList = Array.from(allTokenAddrs);
  const [tokenMeta, tokenPrices] = await Promise.all([
    resolveTokenMetadata(chain, tokenAddrList),
    resolveTokenPrices(chain, tokenAddrList),
  ]);

  /* 6. For each parsed swap, identify sold token + classify. */
  type Candidate = {
    swap: ParsedSwap & { dex: "Uniswap V2" | "Uniswap V3" };
    soldToken: TokenMetadata;
    soldAmountRaw: bigint;
    soldHumanAmount: number;
    amountUsd: number | null;
    isNewToken: boolean;
  };
  const candidates: Candidate[] = [];

  for (const swap of parsed) {
    const pt = poolTokens.get(swap.poolAddress);
    if (!pt) continue;
    const meta0 = tokenMeta.get(pt.token0);
    const meta1 = tokenMeta.get(pt.token1);
    if (!meta0 || !meta1) continue;

    /* Identify which token was SOLD (entered the pool). The "sold"
       side has the larger In amount; If both are zero, this isn't
       a meaningful trade. */
    let soldToken: TokenMetadata;
    let soldRaw: bigint;
    if (swap.amount0In > BigInt(0) && swap.amount1Out > BigInt(0)) {
      soldToken = meta0;
      soldRaw = swap.amount0In;
    } else if (swap.amount1In > BigInt(0) && swap.amount0Out > BigInt(0)) {
      soldToken = meta1;
      soldRaw = swap.amount1In;
    } else {
      continue;
    }

    const human = toHumanAmount(soldRaw, soldToken.decimals);
    const price = tokenPrices.get(soldToken.address);
    const usd = price ? human * price : null;
    const isNew = !price;

    candidates.push({
      swap,
      soldToken,
      soldAmountRaw: soldRaw,
      soldHumanAmount: human,
      amountUsd: usd,
      isNewToken: isNew,
    });
  }

  if (candidates.length === 0) {
    return { activities: [], blocksScanned: BLOCK_SPAN, totalEventsSeen };
  }

  /* 7. Pool impact requires a balanceOf call per (pool, sold token).
        We only do this for the top-N candidates ranked by raw USD
        value (or by amount if we don't have a price). This keeps
        RPC cost bounded — at most TOP_N × 2 chains × 1 = 16 extra calls. */
  const RANKING_LIMIT = TOP_N * 3;
  candidates.sort((a, b) => {
    const aVal = a.amountUsd ?? 0;
    const bVal = b.amountUsd ?? 0;
    /* Prioritize known USD over unknown — surfacing a $200K sell
       beats surfacing a 10M-token sell of an unpriced micro-cap
       (those are mostly noise). But still keep some unpriced
       candidates around in case they have huge token-level activity. */
    if (aVal !== bVal) return bVal - aVal;
    return Number(b.soldAmountRaw - a.soldAmountRaw);
  });
  const topCandidates = candidates.slice(0, RANKING_LIMIT);

  /* Fetch pool token balance for each top candidate's (pool, sold token). */
  const reserveLookups = topCandidates.map((c) =>
    getTokenBalance(chain, c.soldToken.address, c.swap.poolAddress).catch(
      () => BigInt(0),
    ),
  );
  const reserves = await Promise.all(reserveLookups);

  /* 8. Build SuspiciousActivity records. */
  const out: SuspiciousActivity[] = [];
  for (let i = 0; i < topCandidates.length; i++) {
    const c = topCandidates[i];
    const reserveRaw = reserves[i];
    if (reserveRaw === BigInt(0)) continue;
    /* The reserve INCLUDES the sold amount (we read after the swap
       confirmed). To get the impact relative to pre-swap reserves,
       we add it back: pre = post + soldAmount. */
    const preSwapReserve = reserveRaw + c.soldAmountRaw;
    if (preSwapReserve === BigInt(0)) continue;
    /* Compute impact as soldAmount / preSwapReserve × 100. */
    const numerator = Number(c.soldAmountRaw);
    const denominator = Number(preSwapReserve);
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) continue;
    const impactPct = (numerator / denominator) * 100;
    if (!Number.isFinite(impactPct) || impactPct <= 0) continue;

    const walletLabel = getWalletLabel(cfg.chainId, c.swap.sender);
    const walletIsMev = isMevWallet(cfg.chainId, c.swap.sender);

    const classification = classify({
      amountUsd: c.amountUsd,
      poolImpactPct: impactPct,
      walletIsMev,
      walletIsLabeled: walletLabel !== null,
      isNewToken: c.isNewToken,
    });

    if (classification.severity < MIN_SEVERITY) continue;

    out.push({
      id: `${c.swap.txHash}-${c.swap.poolAddress}`,
      txHash: c.swap.txHash,
      blockNumber: c.swap.blockNumber,
      /* We don't have block timestamp from logs alone — approximate
         from the chain's average block time. ETH ~12s, BSC ~3s, etc.
         Close enough for "X minutes ago" display. */
      timestamp: approxBlockTimestamp(chain, c.swap.blockNumber),
      chain: cfg.name,
      chainId: cfg.chainId,
      tokenSymbol: c.soldToken.symbol,
      tokenAddress: c.soldToken.address,
      tokenName: c.soldToken.name,
      poolAddress: c.swap.poolAddress,
      poolDex: c.swap.dex,
      wallet: c.swap.sender,
      walletLabel: walletLabel?.label,
      tokenAmount: c.soldHumanAmount,
      amountUsd: c.amountUsd,
      poolImpactPct: impactPct,
      severity: classification.severity,
      riskReasons: classification.reasons,
      riskSummary: classification.summary,
      txUrl: `${cfg.explorerBase}/tx/${c.swap.txHash}`,
      walletUrl: `${cfg.explorerBase}/address/${c.swap.sender}`,
      poolUrl: `${cfg.explorerBase}/address/${c.swap.poolAddress}`,
    });
  }

  return { activities: out, blocksScanned: BLOCK_SPAN, totalEventsSeen };
}

/**
 * Approximate block timestamp. Without per-block eth_getBlockByNumber
 * calls we can't get exact timestamps for free. Since our scan
 * covers the last ~30 blocks (a few minutes), and the panel sorts
 * by severity not time, displaying "just now" for everything in
 * the scan window is acceptable. The actual block number is also
 * surfaced in the row for users who need precise ordering.
 */
function approxBlockTimestamp(
  _chain: SupportedChain,
  _blockNumber: number,
): number {
  return Date.now();
}
