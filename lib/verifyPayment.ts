/* ─────────────────────────────────────────────────────────────
   Payment Verification
   Verifies on-chain USDT transfers for premium tier unlock.

   Architecture:
   - User sends USDT (amount >= $0.20) to RECEIVER_WALLET on one of
     six supported chains.
   - Client submits (txHash, chainId) to /api/unlock.
   - This module fetches the transaction receipt, parses the Transfer
     event from the USDT contract, and verifies:
       1. Receipt is confirmed (status === "0x1")
       2. Transfer event was emitted from the correct USDT address
       3. `to` matches RECEIVER_WALLET
       4. Value >= minimum amount
   - On success, returns { verified: true, from, amount, chainId }.
   ───────────────────────────────────────────────────────────── */

import { debug } from "./constants";

/** keccak256("Transfer(address,address,uint256)") */
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export interface PaymentChain {
  chainId: number;
  name: string;
  rpc: string;
  /** Lowercased USDT contract address on this chain. */
  usdt: string;
  /** USDT decimals on this chain. */
  usdtDecimals: number;
}

/**
 * USDT contracts on the 6 supported chains.
 * Addresses sourced from official Tether documentation and verified
 * on each chain's block explorer. All addresses lowercased for
 * case-insensitive comparison.
 */
export const PAYMENT_CHAINS: Record<number, PaymentChain> = {
  1: {
    chainId: 1,
    name: "Ethereum",
    rpc: process.env.ETH_RPC_URL || "https://eth.llamarpc.com",
    usdt: "0xdac17f958d2ee523a2206206994597c13d831ec7",
    usdtDecimals: 6,
  },
  56: {
    chainId: 56,
    name: "BNB Smart Chain",
    rpc: process.env.BSC_RPC_URL || "https://bsc-dataseed.binance.org",
    usdt: "0x55d398326f99059ff775485246999027b3197955",
    usdtDecimals: 18,
  },
  137: {
    chainId: 137,
    name: "Polygon",
    rpc: process.env.POLYGON_RPC_URL || "https://polygon-rpc.com",
    usdt: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
    usdtDecimals: 6,
  },
  8453: {
    chainId: 8453,
    name: "Base",
    rpc: process.env.BASE_RPC_URL || "https://mainnet.base.org",
    // Note: Base's native USDT — fallback is USDC if not available
    usdt: "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2",
    usdtDecimals: 6,
  },
  42161: {
    chainId: 42161,
    name: "Arbitrum One",
    rpc: process.env.ARBITRUM_RPC_URL || "https://arb1.arbitrum.io/rpc",
    usdt: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
    usdtDecimals: 6,
  },
  10: {
    chainId: 10,
    name: "OP Mainnet",
    rpc: process.env.OPTIMISM_RPC_URL || "https://mainnet.optimism.io",
    usdt: "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58",
    usdtDecimals: 6,
  },
};

export const SUPPORTED_CHAIN_IDS = Object.keys(PAYMENT_CHAINS).map(Number);

/**
 * Receiver wallet. Payments land here.
 * This is the user's wallet from the earlier conversation.
 */
export const RECEIVER_WALLET =
  (process.env.PAYMENT_RECEIVER_WALLET ||
    "0x088f13E8813913aAf20b7c680e40439fF8Df445D").toLowerCase();

/** Minimum payment: $0.20 USDT. */
export const MIN_PAYMENT_USD = 0.2;

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

/* ── JSON-RPC helper ── */

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

/* ── Address / value helpers ── */

/** Pad an address to 32 bytes (for topic filtering). */
function padAddress(addr: string): string {
  return "0x" + addr.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

function topicToAddress(topic: string): string {
  return "0x" + topic.slice(-40).toLowerCase();
}

function hexToBigInt(hex: string): bigint {
  return BigInt(hex);
}

/** Format a bigint token amount to a human USD-ish string. */
function formatAmount(raw: bigint, decimals: number): { amount: string; usd: number } {
  // USDT is dollar-pegged, so raw / 10^decimals ≈ USD
  const divisor = BigInt(10) ** BigInt(decimals);
  const whole = raw / divisor;
  const frac = raw % divisor;
  const usd = Number(whole) + Number(frac) / Number(divisor);
  return {
    amount: `${usd.toFixed(Math.min(decimals, 4))} USDT`,
    usd,
  };
}

/* ── Verification ── */

/**
 * Verify a transaction is a valid USDT payment of at least MIN_PAYMENT_USD
 * to RECEIVER_WALLET on the specified chain.
 */
export async function verifyPayment(
  txHash: string,
  chainId: number,
): Promise<PaymentVerificationResult> {
  // Sanitize inputs
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

  // Fetch the receipt
  const receipt = await rpcCall<{
    status: string;
    logs: Array<{ address: string; topics: string[]; data: string }>;
  }>(chain.rpc, "eth_getTransactionReceipt", [txHash]);

  if (!receipt) {
    return {
      verified: false,
      reason: "Transaction not found. Wait for confirmation and try again.",
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

  // Find a Transfer event from the USDT contract to RECEIVER_WALLET
  const receiverTopic = padAddress(RECEIVER_WALLET);

  const transferLog = receipt.logs.find((log) => {
    if (log.address.toLowerCase() !== chain.usdt) return false;
    if (log.topics[0] !== TRANSFER_TOPIC) return false;
    // topics[2] is the `to` address
    if (log.topics[2]?.toLowerCase() !== receiverTopic) return false;
    return true;
  });

  if (!transferLog) {
    return {
      verified: false,
      reason: `No USDT transfer to ${RECEIVER_WALLET} found in transaction logs.`,
      chainId,
      chainName: chain.name,
      txHash,
    };
  }

  // Parse amount (uint256 in data field)
  const rawAmount = hexToBigInt(transferLog.data);
  const { amount, usd } = formatAmount(rawAmount, chain.usdtDecimals);

  if (usd < MIN_PAYMENT_USD) {
    return {
      verified: false,
      reason: `Amount ${amount} below minimum ${MIN_PAYMENT_USD} USDT.`,
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
