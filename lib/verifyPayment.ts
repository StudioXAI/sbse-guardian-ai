/* ─────────────────────────────────────────────────────────────
   Payment Verification — USDC $2 across 6 chains

   Changed in Batch 4:
   - USDT → USDC (universally supported, unlike USDT-on-Base)
   - $0.20 → $2 minimum
   - Normalized all decimals (most USDC is 6-decimal; BSC peg is 18)
   ───────────────────────────────────────────────────────────── */

import { debug } from "./constants";

/** keccak256("Transfer(address,address,uint256)") */
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export interface PaymentChain {
  chainId: number;
  name: string;
  rpc: string;
  /** Lowercased USDC contract address. */
  usdc: string;
  usdcDecimals: number;
}

/** USDC on each of the 6 chains (addresses verified from Circle + chain explorers). */
export const PAYMENT_CHAINS: Record<number, PaymentChain> = {
  1: {
    chainId: 1,
    name: "Ethereum",
    rpc: process.env.ETH_RPC_URL || "https://eth.llamarpc.com",
    usdc: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    usdcDecimals: 6,
  },
  56: {
    chainId: 56,
    name: "BNB Smart Chain",
    rpc: process.env.BSC_RPC_URL || "https://bsc-dataseed.binance.org",
    // Binance-Peg USD Coin is 18 decimals on BSC
    usdc: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
    usdcDecimals: 18,
  },
  137: {
    chainId: 137,
    name: "Polygon",
    rpc: process.env.POLYGON_RPC_URL || "https://polygon-rpc.com",
    // Native Circle-issued USDC on Polygon
    usdc: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
    usdcDecimals: 6,
  },
  8453: {
    chainId: 8453,
    name: "Base",
    rpc: process.env.BASE_RPC_URL || "https://mainnet.base.org",
    // Circle native USDC on Base
    usdc: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    usdcDecimals: 6,
  },
  42161: {
    chainId: 42161,
    name: "Arbitrum One",
    rpc: process.env.ARBITRUM_RPC_URL || "https://arb1.arbitrum.io/rpc",
    // Native USDC on Arbitrum (not USDC.e)
    usdc: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
    usdcDecimals: 6,
  },
  10: {
    chainId: 10,
    name: "OP Mainnet",
    rpc: process.env.OPTIMISM_RPC_URL || "https://mainnet.optimism.io",
    // Native USDC on Optimism (not USDC.e)
    usdc: "0x0b2c639c533813f4aa9d7837caf62653d097ff85",
    usdcDecimals: 6,
  },
};

export const SUPPORTED_CHAIN_IDS = Object.keys(PAYMENT_CHAINS).map(Number);

export const RECEIVER_WALLET =
  (process.env.PAYMENT_RECEIVER_WALLET ||
    "0x088f13E8813913aAf20b7c680e40439fF8Df445D").toLowerCase();

/** Minimum payment: $2 USDC. */
export const MIN_PAYMENT_USD = 2;

export interface PaymentVerificationResult {
  verified: boolean;
  reason?: string;
  from?: string;
  amount?: string;
  amountUsd?: number;
  chainId?: number;
  chainName?: string;
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

function formatAmount(raw: bigint, decimals: number): { amount: string; usd: number } {
  const divisor = BigInt(10) ** BigInt(decimals);
  const whole = raw / divisor;
  const frac = raw % divisor;
  const usd = Number(whole) + Number(frac) / Number(divisor);
  return {
    amount: `${usd.toFixed(Math.min(decimals, 4))} USDC`,
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
      reason: "Transaction not found. Wait a moment and retry.",
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

  const transferLog = receipt.logs.find((log) => {
    if (log.address.toLowerCase() !== chain.usdc) return false;
    if (log.topics[0] !== TRANSFER_TOPIC) return false;
    if (log.topics[2]?.toLowerCase() !== receiverTopic) return false;
    return true;
  });

  if (!transferLog) {
    return {
      verified: false,
      reason: `No USDC transfer to ${RECEIVER_WALLET} found in tx logs.`,
      chainId,
      chainName: chain.name,
      txHash,
    };
  }

  const rawAmount = BigInt(transferLog.data);
  const { amount, usd } = formatAmount(rawAmount, chain.usdcDecimals);

  if (usd < MIN_PAYMENT_USD) {
    return {
      verified: false,
      reason: `Amount ${amount} below minimum ${MIN_PAYMENT_USD} USDC.`,
      chainId,
      chainName: chain.name,
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
    txHash,
  };
}
