/* ─────────────────────────────────────────────────────────────
   Payment Verification — Dual Rail: USDT or USDC
   Accepts $2 minimum of EITHER stablecoin across 6 chains.

   Previously USDC-only; switched to dual-rail because many users
   only hold USDT. Server just checks both token addresses in the
   tx logs and accepts whichever matches.
   ───────────────────────────────────────────────────────────── */

import { debug } from "./constants";

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export type Stablecoin = "USDC" | "USDT";

export interface TokenInfo {
  address: string;   // lowercase
  decimals: number;
  symbol: Stablecoin;
}

export interface PaymentChain {
  chainId: number;
  name: string;
  rpc: string;
  tokens: TokenInfo[];
}

/**
 * Addresses verified from:
 * - Circle's docs (USDC)
 * - Tether's docs (USDT)
 * - Each chain's block explorer
 *
 * All addresses lowercased for case-insensitive matching.
 */
export const PAYMENT_CHAINS: Record<number, PaymentChain> = {
  1: {
    chainId: 1,
    name: "Ethereum",
    rpc: process.env.ETH_RPC_URL || "https://eth.llamarpc.com",
    tokens: [
      { address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", decimals: 6, symbol: "USDC" },
      { address: "0xdac17f958d2ee523a2206206994597c13d831ec7", decimals: 6, symbol: "USDT" },
    ],
  },
  56: {
    chainId: 56,
    name: "BNB Smart Chain",
    rpc: process.env.BSC_RPC_URL || "https://bsc-dataseed.binance.org",
    tokens: [
      { address: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", decimals: 18, symbol: "USDC" },
      { address: "0x55d398326f99059ff775485246999027b3197955", decimals: 18, symbol: "USDT" },
    ],
  },
  137: {
    chainId: 137,
    name: "Polygon",
    rpc: process.env.POLYGON_RPC_URL || "https://polygon-rpc.com",
    tokens: [
      { address: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", decimals: 6, symbol: "USDC" },
      { address: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", decimals: 6, symbol: "USDT" },
    ],
  },
  8453: {
    chainId: 8453,
    name: "Base",
    rpc: process.env.BASE_RPC_URL || "https://mainnet.base.org",
    tokens: [
      { address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", decimals: 6, symbol: "USDC" },
      // Base USDT is thin — include for completeness
      { address: "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2", decimals: 6, symbol: "USDT" },
    ],
  },
  42161: {
    chainId: 42161,
    name: "Arbitrum One",
    rpc: process.env.ARBITRUM_RPC_URL || "https://arb1.arbitrum.io/rpc",
    tokens: [
      { address: "0xaf88d065e77c8cc2239327c5edb3a432268e5831", decimals: 6, symbol: "USDC" },
      { address: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9", decimals: 6, symbol: "USDT" },
    ],
  },
  10: {
    chainId: 10,
    name: "OP Mainnet",
    rpc: process.env.OPTIMISM_RPC_URL || "https://mainnet.optimism.io",
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

export interface PaymentVerificationResult {
  verified: boolean;
  reason?: string;
  from?: string;
  amount?: string;
  amountUsd?: number;
  chainId?: number;
  chainName?: string;
  stablecoin?: Stablecoin;
  txHash?: string;
}

async function rpcCall<T>(
  rpcUrl: string,
  method: string,
  params: unknown[],
  timeoutMs = 10_000,
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
    if (!res.ok) return null;
    const data = await res.json();
    if (data.error) {
      debug(`RPC error on ${method}:`, data.error?.message);
      return null;
    }
    return data.result as T;
  } catch (e) {
    debug(`RPC call failed on ${method}:`, e);
    return null;
  }
}

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

export async function verifyPayment(
  txHash: string,
  chainId: number,
): Promise<PaymentVerificationResult> {
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    return { verified: false, reason: "Invalid transaction hash format" };
  }

  const chain = PAYMENT_CHAINS[chainId];
  if (!chain) {
    return {
      verified: false,
      reason: `Unsupported chain ID ${chainId}. Supported: ${SUPPORTED_CHAIN_IDS.join(", ")}`,
    };
  }

  const receipt = await rpcCall<{
    status: string;
    logs: Array<{ address: string; topics: string[]; data: string }>;
  }>(chain.rpc, "eth_getTransactionReceipt", [txHash]);

  if (!receipt) {
    return {
      verified: false,
      reason: "Transaction not found. Wait for confirmation and retry.",
      chainId,
      chainName: chain.name,
      txHash,
    };
  }

  if (receipt.status !== "0x1") {
    return {
      verified: false,
      reason: "Transaction failed on-chain.",
      chainId,
      chainName: chain.name,
      txHash,
    };
  }

  const receiverTopic = padAddress(RECEIVER_WALLET);

  // Check each supported stablecoin on this chain
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
    reason: `No USDC or USDT transfer to ${RECEIVER_WALLET} found in tx logs.`,
    chainId,
    chainName: chain.name,
    txHash,
  };
}
