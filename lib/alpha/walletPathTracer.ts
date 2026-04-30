/* ─────────────────────────────────────────────────────────────
   Wallet Path Tracer

   Given a wallet address and a chain, trace the recent fund flow:
   - Backward: where did this wallet receive its largest inflows from?
   - Forward:  where did this wallet send its largest outflows to?

   Up to 3 hops max. Stops at known CEX wallets (terminal — funds
   entered or exited the on-chain world there).

   This is on-demand only — not part of the periodic threat refresh.
   The user clicks a wallet from a flagged event and we trace from
   there. Cached 5 minutes server-side.
   ───────────────────────────────────────────────────────────── */

import { TtlCache } from "./cache";
import { getWalletLabel, getWalletCategory } from "./walletLabels";

const CACHE_TTL_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;
const ETHERSCAN_V2 = "https://api.etherscan.io/v2/api";
const TRACE_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const MAX_HOPS = 3;
const TOP_PER_HOP = 3; // top 3 inflows + top 3 outflows per wallet

export interface TraceNode {
  address: string;
  label?: string;
  /** "cex" | "dex" | "whale" | "team" | "mev" | null. */
  category: string | null;
  /** Hop number from the origin (0 = origin). */
  hop: number;
  /** "backward" = where this wallet got funds from; "forward" = where it sent funds. */
  direction: "backward" | "forward" | "origin";
  /** ETH/native amount that flowed in this hop, in human units. */
  nativeAmount: number;
  /** Approximate USD value (using a static heuristic since we don't fetch token prices per trace). */
  approxUsd: number;
  /** True if the trace stopped here (terminal — CEX or hop limit). */
  isTerminal: boolean;
  /** Tx hash for this hop. */
  txHash?: string;
  /** Block explorer URL for this address. */
  explorerUrl: string;
}

export interface WalletTrace {
  origin: string;
  chainId: number;
  chainName: string;
  /** Backward chain — most recent inflows tracing back. */
  backward: TraceNode[];
  /** Forward chain — most recent outflows tracing forward. */
  forward: TraceNode[];
  /** Plain-English summary of what was found. */
  summary: string;
  generatedAt: number;
}

const cache = new TtlCache<WalletTrace>(CACHE_TTL_MS);

const EXPLORER: Record<number, { name: string; base: string }> = {
  1: { name: "Ethereum", base: "https://etherscan.io" },
  56: { name: "BSC", base: "https://bscscan.com" },
  137: { name: "Polygon", base: "https://polygonscan.com" },
  42161: { name: "Arbitrum", base: "https://arbiscan.io" },
  10: { name: "Optimism", base: "https://optimistic.etherscan.io" },
  8453: { name: "Base", base: "https://basescan.org" },
};

interface EtherscanTx {
  hash?: string;
  timeStamp?: string;
  from?: string;
  to?: string;
  value?: string;
}

/**
 * Fetch normal (native) transactions for an address. We use this
 * for trace because token transfers complicate the "follow the
 * money" view (each hop could be a different token). Native
 * transfers are simpler and usually capture the gas/seed flow.
 */
async function fetchAddressTxs(
  apiKey: string,
  chainId: number,
  address: string,
): Promise<EtherscanTx[]> {
  const url =
    `${ETHERSCAN_V2}?chainid=${chainId}` +
    `&module=account&action=txlist` +
    `&address=${address}` +
    `&page=1&offset=200&sort=desc&apikey=${apiKey}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      status?: string;
      result?: EtherscanTx[] | string;
    };
    if (json.status !== "1" || !Array.isArray(json.result)) return [];
    return json.result;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Convert wei value to native amount (decimal 18 for ETH/BNB/MATIC).
 */
function weiToNative(value: string): number {
  try {
    const raw = BigInt(value);
    const divisor = BigInt(10) ** BigInt(18);
    const whole = Number(raw / divisor);
    const frac = Number(raw % divisor) / Number(divisor);
    return whole + frac;
  } catch {
    return 0;
  }
}

/* Rough native asset USD prices for trace display — these don't
   need to be exact, just give the user a ballpark. We don't pull
   live prices on every trace request to keep latency low. */
const NATIVE_PRICE_USD: Record<number, number> = {
  1: 3500, // ETH
  56: 600, // BNB
  137: 0.6, // MATIC
  42161: 3500, // ETH on Arbitrum
  10: 3500, // ETH on Optimism
  8453: 3500, // ETH on Base
};

/**
 * Process a wallet's transactions and return its top inflows and
 * outflows (excluding self-transfers and dust).
 */
function summarizeFlow(
  txs: EtherscanTx[],
  walletAddress: string,
  cutoffTs: number,
): { inflows: Map<string, { amount: number; lastTx: string }>; outflows: Map<string, { amount: number; lastTx: string }> } {
  const wallet = walletAddress.toLowerCase();
  const inflows = new Map<string, { amount: number; lastTx: string }>();
  const outflows = new Map<string, { amount: number; lastTx: string }>();

  for (const tx of txs) {
    const ts = parseInt(tx.timeStamp ?? "0", 10) * 1000;
    if (!Number.isFinite(ts) || ts < cutoffTs) continue;
    if (!tx.from || !tx.to || !tx.value || !tx.hash) continue;

    const from = tx.from.toLowerCase();
    const to = tx.to.toLowerCase();
    if (from === to) continue; // self-transfer

    const amount = weiToNative(tx.value);
    if (amount < 0.01) continue; // dust

    if (to === wallet) {
      const existing = inflows.get(from);
      if (existing) {
        existing.amount += amount;
      } else {
        inflows.set(from, { amount, lastTx: tx.hash });
      }
    } else if (from === wallet) {
      const existing = outflows.get(to);
      if (existing) {
        existing.amount += amount;
      } else {
        outflows.set(to, { amount, lastTx: tx.hash });
      }
    }
  }

  return { inflows, outflows };
}

/**
 * Build a chain of nodes by walking backward (inflows) or forward
 * (outflows) from the origin, up to MAX_HOPS hops. Stops early
 * at known CEX/MEV/team wallets (terminal nodes).
 */
async function walkChain(
  apiKey: string,
  chainId: number,
  origin: string,
  direction: "backward" | "forward",
): Promise<TraceNode[]> {
  const out: TraceNode[] = [];
  const explorerBase = EXPLORER[chainId]?.base ?? "https://etherscan.io";
  const nativePrice = NATIVE_PRICE_USD[chainId] ?? 0;
  const cutoffTs = Date.now() - TRACE_LOOKBACK_MS;

  let currentAddress = origin.toLowerCase();
  let currentHop = 0;
  const visited = new Set<string>([currentAddress]);

  while (currentHop < MAX_HOPS) {
    const txs = await fetchAddressTxs(apiKey, chainId, currentAddress);
    if (txs.length === 0) break;

    const { inflows, outflows } = summarizeFlow(txs, currentAddress, cutoffTs);
    const flowMap = direction === "backward" ? inflows : outflows;
    if (flowMap.size === 0) break;

    /* Pick the largest counterparty — most informative single-path trace. */
    const sorted = [...flowMap.entries()].sort(
      (a, b) => b[1].amount - a[1].amount,
    );
    const [nextAddr, info] = sorted[0];

    /* Avoid loops */
    if (visited.has(nextAddr)) break;
    visited.add(nextAddr);

    currentHop++;
    const labelInfo = getWalletLabel(chainId, nextAddr);
    const category = getWalletCategory(chainId, nextAddr);
    const isTerminal =
      category === "cex" || category === "team" || currentHop >= MAX_HOPS;

    out.push({
      address: nextAddr,
      label: labelInfo?.label,
      category,
      hop: currentHop,
      direction,
      nativeAmount: info.amount,
      approxUsd: info.amount * nativePrice,
      isTerminal,
      txHash: info.lastTx,
      explorerUrl: `${explorerBase}/address/${nextAddr}`,
    });

    if (isTerminal) break;
    currentAddress = nextAddr;
  }

  return out;
}

/**
 * Build a plain-English summary describing what the trace shows.
 * Honest about uncertainty — never claim more than the data supports.
 */
function buildSummary(
  origin: string,
  backward: TraceNode[],
  forward: TraceNode[],
): string {
  const parts: string[] = [];

  if (backward.length > 0) {
    const last = backward[backward.length - 1];
    if (last.category === "cex") {
      parts.push(
        `Funds traced back to ${last.label ?? "a centralized exchange"} ${backward.length} hop(s) ago.`,
      );
    } else if (last.isTerminal) {
      parts.push(
        `Source trace stopped at ${last.label ?? "an unknown wallet"} after ${backward.length} hop(s) — origin not identified.`,
      );
    } else {
      parts.push(
        `Source trace covered ${backward.length} hop(s) without reaching a known terminal.`,
      );
    }
  } else {
    parts.push("No significant inflows in the last 24 hours.");
  }

  if (forward.length > 0) {
    const last = forward[forward.length - 1];
    if (last.category === "cex") {
      parts.push(
        `Funds forwarded to ${last.label ?? "a centralized exchange"} after ${forward.length} hop(s).`,
      );
    } else if (last.isTerminal) {
      parts.push(
        `Forward trace stopped at ${last.label ?? "an unknown wallet"} after ${forward.length} hop(s).`,
      );
    } else {
      parts.push(
        `Forward trace covered ${forward.length} hop(s) without reaching a known destination.`,
      );
    }
  } else {
    parts.push("No significant outflows in the last 24 hours.");
  }

  parts.push(
    "Trace covers native asset transfers only — token transfers may follow different paths.",
  );

  return parts.join(" ");
}

export async function traceWallet(
  address: string,
  chainId: number,
): Promise<WalletTrace | null> {
  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) return null;

  const cacheKey = `${chainId}:${address.toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const explorer = EXPLORER[chainId];
  if (!explorer) return null;

  /* Run backward and forward walks in parallel. */
  const [backward, forward] = await Promise.all([
    walkChain(apiKey, chainId, address, "backward"),
    walkChain(apiKey, chainId, address, "forward"),
  ]);

  const trace: WalletTrace = {
    origin: address,
    chainId,
    chainName: explorer.name,
    backward,
    forward,
    summary: buildSummary(address, backward, forward),
    generatedAt: Date.now(),
  };

  cache.set(cacheKey, trace);
  return trace;
}
