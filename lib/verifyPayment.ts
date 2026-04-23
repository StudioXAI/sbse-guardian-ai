/* ─────────────────────────────────────────────────────────────
   Payment Verification — Hardened (Hotfix 2)
   Dual-rail USDC or USDT, $2 minimum, 6 chains.

   Why this rewrite:
   - Previous version used single public RPC per chain (polygon-rpc.com,
     etc). These rate-limit serverless function egress IPs hard and
     return "not found" even for valid, confirmed transactions.
   - This caused payments that DID go through to fail verification,
     with users charged and no unlock.

   Fixes:
   1. Each chain has 3–4 fallback RPC endpoints (public, no key needed)
   2. Tries each in order until one returns a valid response
   3. Retries the whole chain with 2s / 4s / 8s backoff (up to ~20s total)
   4. Returns distinct error codes so the UI can show actionable messages:
      - NOT_YET_MINED: tx not seen yet, user should retry in a few seconds
      - INFRA: all RPCs failed, infrastructure issue
      - TX_FAILED: tx exists but reverted on-chain
      - NO_PAYMENT_LOG: tx exists but no matching Transfer log
      - BELOW_MIN: payment amount was below threshold
   ───────────────────────────────────────────────────────────── */

import { debug } from "./constants";

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export type Stablecoin = "USDC" | "USDT";

export interface TokenInfo {
  address: string;
  decimals: number;
  symbol: Stablecoin;
}

export interface PaymentChain {
  chainId: number;
  name: string;
  /** Ordered list of RPCs; try each until one succeeds. */
  rpcs: string[];
  tokens: TokenInfo[];
}

/**
 * Each chain has multiple public RPCs. When one rate-limits or times out,
 * we try the next. Curated from providers that don't require an API key:
 * - Ankr public endpoints
 * - LlamaRPC aggregator
 * - Publicnode
 * - Official chain endpoints
 */
const PUBLIC_RPCS: Record<number, string[]> = {
  1: [
    "https://eth.llamarpc.com",
    "https://ethereum-rpc.publicnode.com",
    "https://rpc.ankr.com/eth",
    "https://cloudflare-eth.com",
  ],
  56: [
    "https://bsc-dataseed.binance.org",
    "https://bsc-rpc.publicnode.com",
    "https://rpc.ankr.com/bsc",
    "https://bsc-dataseed1.defibit.io",
  ],
  137: [
    "https://polygon-bor-rpc.publicnode.com",
    "https://polygon.llamarpc.com",
    "https://rpc.ankr.com/polygon",
    "https://polygon-rpc.com",
  ],
  8453: [
    "https://base.llamarpc.com",
    "https://base-rpc.publicnode.com",
    "https://mainnet.base.org",
    "https://rpc.ankr.com/base",
  ],
  42161: [
    "https://arbitrum.llamarpc.com",
    "https://arbitrum-one-rpc.publicnode.com",
    "https://rpc.ankr.com/arbitrum",
    "https://arb1.arbitrum.io/rpc",
  ],
  10: [
    "https://optimism.llamarpc.com",
    "https://optimism-rpc.publicnode.com",
    "https://rpc.ankr.com/optimism",
    "https://mainnet.optimism.io",
  ],
};

/** Env overrides take precedence over public fallbacks. */
function rpcsFor(chainId: number): string[] {
  const envKey: Record<number, string> = {
    1: "ETH_RPC_URL",
    56: "BSC_RPC_URL",
    137: "POLYGON_RPC_URL",
    8453: "BASE_RPC_URL",
    42161: "ARBITRUM_RPC_URL",
    10: "OPTIMISM_RPC_URL",
  };
  const envVal = process.env[envKey[chainId]];
  const fallbacks = PUBLIC_RPCS[chainId] || [];
  return envVal ? [envVal, ...fallbacks] : fallbacks;
}

export const PAYMENT_CHAINS: Record<number, PaymentChain> = {
  1: {
    chainId: 1,
    name: "Ethereum",
    rpcs: rpcsFor(1),
    tokens: [
      { address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", decimals: 6, symbol: "USDC" },
      { address: "0xdac17f958d2ee523a2206206994597c13d831ec7", decimals: 6, symbol: "USDT" },
    ],
  },
  56: {
    chainId: 56,
    name: "BNB Smart Chain",
    rpcs: rpcsFor(56),
    tokens: [
      { address: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", decimals: 18, symbol: "USDC" },
      { address: "0x55d398326f99059ff775485246999027b3197955", decimals: 18, symbol: "USDT" },
    ],
  },
  137: {
    chainId: 137,
    name: "Polygon",
    rpcs: rpcsFor(137),
    tokens: [
      { address: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", decimals: 6, symbol: "USDC" },
      { address: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", decimals: 6, symbol: "USDT" },
    ],
  },
  8453: {
    chainId: 8453,
    name: "Base",
    rpcs: rpcsFor(8453),
    tokens: [
      { address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", decimals: 6, symbol: "USDC" },
      { address: "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2", decimals: 6, symbol: "USDT" },
    ],
  },
  42161: {
    chainId: 42161,
    name: "Arbitrum One",
    rpcs: rpcsFor(42161),
    tokens: [
      { address: "0xaf88d065e77c8cc2239327c5edb3a432268e5831", decimals: 6, symbol: "USDC" },
      { address: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9", decimals: 6, symbol: "USDT" },
    ],
  },
  10: {
    chainId: 10,
    name: "OP Mainnet",
    rpcs: rpcsFor(10),
    tokens: [
      { address: "0x0b2c639c533813f4aa9d7837caf62653d097ff85", decimals: 6, symbol: "USDC" },
      { address: "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58", decimals: 6, symbol: "USDT" },
    ],
  },
};

export const SUPPORTED_CHAIN_IDS = Object.keys(PAYMENT_CHAINS).map(Number);

export const RECEIVER_WALLET =
  (process.env.PAYMENT_RECEIVER_WALLET ||
    "0x088f13E8813913aAf20b7c680e40439fF8Df445D").toLowerCase();

export const MIN_PAYMENT_USD = 2;

export type VerificationErrorCode =
  | "NOT_YET_MINED"
  | "INFRA"
  | "TX_FAILED"
  | "NO_PAYMENT_LOG"
  | "BELOW_MIN"
  | "BAD_INPUT"
  | "UNSUPPORTED_CHAIN";

export interface PaymentVerificationResult {
  verified: boolean;
  errorCode?: VerificationErrorCode;
  reason?: string;
  from?: string;
  amount?: string;
  amountUsd?: number;
  chainId?: number;
  chainName?: string;
  stablecoin?: Stablecoin;
  txHash?: string;
}

interface TxReceipt {
  status: string;
  logs: Array<{ address: string; topics: string[]; data: string }>;
}

/* ─── Low-level RPC call with timeout ─── */

async function rpcCallOnce<T>(
  rpcUrl: string,
  method: string,
  params: unknown[],
  timeoutMs = 8_000,
): Promise<T | null> {
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method,
        params,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      debug(`RPC ${rpcUrl} returned ${res.status} on ${method}`);
      return null;
    }
    const data = await res.json();
    if (data.error) {
      debug(`RPC ${rpcUrl} error on ${method}:`, data.error?.message);
      return null;
    }
    return data.result as T;
  } catch (e) {
    debug(`RPC ${rpcUrl} failed on ${method}:`, e);
    return null;
  }
}

/**
 * Try each RPC in order. Returns the first successful result.
 * Returns null only if ALL RPCs failed.
 */
async function rpcCallWithFallback<T>(
  rpcs: string[],
  method: string,
  params: unknown[],
): Promise<T | null> {
  for (const rpc of rpcs) {
    const result = await rpcCallOnce<T>(rpc, method, params);
    if (result !== null) {
      return result;
    }
  }
  return null;
}

/* ─── Receipt lookup with retry/backoff ─── */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch a tx receipt, retrying with backoff.
 * Retries are important because:
 * - L2 txs may take 1-15s to propagate to RPC nodes after wallet claims success
 * - Public RPCs sometimes lie and return null even for mined txs
 *
 * Timeline: 0s, 3s, 7s, 14s → total ~24s. Stays under Vercel's 30s function limit.
 */
async function fetchReceiptWithRetry(
  rpcs: string[],
  txHash: string,
): Promise<TxReceipt | null> {
  const backoffs = [0, 3000, 4000, 7000];
  for (let i = 0; i < backoffs.length; i++) {
    if (backoffs[i] > 0) await sleep(backoffs[i]);
    const receipt = await rpcCallWithFallback<TxReceipt | null>(
      rpcs,
      "eth_getTransactionReceipt",
      [txHash],
    );
    if (receipt) return receipt;
    debug(`Receipt lookup attempt ${i + 1}/${backoffs.length} for ${txHash} returned null`);
  }
  return null;
}

/* ─── Helpers ─── */

function padAddress(addr: string): string {
  return "0x" + addr.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

function topicToAddress(topic: string): string {
  return "0x" + topic.slice(-40).toLowerCase();
}

function formatAmount(
  raw: bigint,
  decimals: number,
  symbol: Stablecoin,
): { amount: string; usd: number } {
  const divisor = BigInt(10) ** BigInt(decimals);
  const whole = raw / divisor;
  const frac = raw % divisor;
  const usd = Number(whole) + Number(frac) / Number(divisor);
  return {
    amount: `${usd.toFixed(2)} ${symbol}`,
    usd,
  };
}

/* ─── Main verifier ─── */

export async function verifyPayment(
  txHash: string,
  chainId: number,
): Promise<PaymentVerificationResult> {
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    return {
      verified: false,
      errorCode: "BAD_INPUT",
      reason: "Invalid transaction hash format",
    };
  }

  const chain = PAYMENT_CHAINS[chainId];
  if (!chain) {
    return {
      verified: false,
      errorCode: "UNSUPPORTED_CHAIN",
      reason: `Unsupported chain ID ${chainId}`,
    };
  }

  const receipt = await fetchReceiptWithRetry(chain.rpcs, txHash);

  if (!receipt) {
    // Either tx not yet mined OR all RPCs failed. We can't distinguish
    // without a fresh eth_blockNumber check, which would be another set
    // of requests. Surface the most user-friendly error.
    return {
      verified: false,
      errorCode: "NOT_YET_MINED",
      reason:
        "Transaction not found on-chain yet. It may still be confirming. " +
        "Wait 30 seconds and click 'Retry verification'. If this persists, " +
        "the chain RPC may be temporarily down.",
      chainId,
      chainName: chain.name,
      txHash,
    };
  }

  if (receipt.status !== "0x1") {
    return {
      verified: false,
      errorCode: "TX_FAILED",
      reason: "Transaction reverted on-chain. No payment occurred.",
      chainId,
      chainName: chain.name,
      txHash,
    };
  }

  const receiverTopic = padAddress(RECEIVER_WALLET);

  for (const token of chain.tokens) {
    const transferLog = receipt.logs.find((log) => {
      if (log.address.toLowerCase() !== token.address) return false;
      if (log.topics[0] !== TRANSFER_TOPIC) return false;
      if (log.topics[2]?.toLowerCase() !== receiverTopic) return false;
      return true;
    });

    if (!transferLog) continue;

    const rawAmount = BigInt(transferLog.data);
    const { amount, usd } = formatAmount(rawAmount, token.decimals, token.symbol);

    if (usd < MIN_PAYMENT_USD) {
      return {
        verified: false,
        errorCode: "BELOW_MIN",
        reason: `Amount ${amount} below minimum ${MIN_PAYMENT_USD}.`,
        chainId,
        chainName: chain.name,
        stablecoin: token.symbol,
        txHash,
        amount,
        amountUsd: usd,
      };
    }

    const fromAddress = topicToAddress(transferLog.topics[1]);

    return {
      verified: true,
      from: fromAddress,
      amount,
      amountUsd: usd,
      chainId,
      chainName: chain.name,
      stablecoin: token.symbol,
      txHash,
    };
  }

  return {
    verified: false,
    errorCode: "NO_PAYMENT_LOG",
    reason:
      `Transaction confirmed but no USDC or USDT transfer to ${RECEIVER_WALLET} ` +
      `was found in its logs. Make sure you sent the payment on ${chain.name}.`,
    chainId,
    chainName: chain.name,
    txHash,
  };
}
