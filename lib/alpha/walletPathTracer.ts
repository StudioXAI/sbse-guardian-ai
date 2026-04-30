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
  /** Native asset amount when applicable. 0 for token-only flows. */
  nativeAmount: number;
  /** Approximate USD value of this hop's flow. */
  approxUsd: number;
  /** Human-readable description of what was transferred ("12.4K USDC", "0.5 ETH", "1.2K USDT + 200 WETH"). */
  flowDescription?: string;
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

/* Tracker for tokens we encounter during trace — symbol resolution
   isn't critical (Etherscan tokentx returns symbol directly). */
interface TokenTxRecord {
  hash: string;
  timeStamp: string;
  from: string;
  to: string;
  value: string; // raw token units
  tokenSymbol: string;
  tokenDecimal: string; // string-encoded number
  contractAddress: string;
}

/**
 * Fetch both native and token transactions for an address. Native
 * transfers come from txlist; token transfers come from tokentx.
 * Merging both gives us a much richer view of fund flow — most
 * wallets people want to trace are token-active (not native-active).
 */
async function fetchAddressTxs(
  apiKey: string,
  chainId: number,
  address: string,
): Promise<{ native: EtherscanTx[]; tokens: TokenTxRecord[] }> {
  const baseUrl = `${ETHERSCAN_V2}?chainid=${chainId}`;
  const txlistUrl =
    `${baseUrl}&module=account&action=txlist&address=${address}` +
    `&page=1&offset=200&sort=desc&apikey=${apiKey}`;
  const tokentxUrl =
    `${baseUrl}&module=account&action=tokentx&address=${address}` +
    `&page=1&offset=200&sort=desc&apikey=${apiKey}`;

  async function safeFetch<T>(url: string): Promise<T[]> {
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
        result?: T[] | string;
      };
      if (json.status !== "1" || !Array.isArray(json.result)) return [];
      return json.result;
    } catch {
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  const [native, tokens] = await Promise.all([
    safeFetch<EtherscanTx>(txlistUrl),
    safeFetch<TokenTxRecord>(tokentxUrl),
  ]);

  return { native, tokens };
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

/* Approximate USD prices for major tokens to rank token transfers.
   We don't need precise prices — the trace just shows the most
   informative single-path. Anything not in this map gets a
   nominal value (1 unit) so it's still considered. */
const TOKEN_USD_HEURISTIC: Record<string, number> = {
  // Stablecoins — value ≈ $1
  USDT: 1, USDC: 1, DAI: 1, BUSD: 1, TUSD: 1, USDE: 1, FDUSD: 1, PYUSD: 1,
  // Wrapped natives — track ETH-ish value
  WETH: 3500, WBNB: 600, WMATIC: 0.6, WAVAX: 30,
  // Major liquids — rough recent prices
  WBTC: 95000, BTCB: 95000,
  LINK: 18, UNI: 9, AAVE: 130, MKR: 2200, COMP: 60,
  // Mid-cap reference (rough — better than 1)
  ARB: 0.6, OP: 1.5, MATIC: 0.6,
};

interface FlowEntry {
  /** Counterparty address. */
  address: string;
  /** Best-effort USD value of the cumulative flow with this counterparty. */
  approxUsd: number;
  /** Most recent tx hash with this counterparty (for display + next-hop lookup). */
  lastTx: string;
  /** Description of what was transferred (e.g. "0.5 ETH" or "12.4 WETH + 320 USDC"). */
  description: string;
}

/**
 * Process native + token transfers and return top inflows / outflows
 * by approximate USD value. Each counterparty entry aggregates all
 * activity (multiple transfers in either direction).
 */
function summarizeFlow(
  txs: { native: EtherscanTx[]; tokens: TokenTxRecord[] },
  walletAddress: string,
  chainId: number,
  cutoffTs: number,
): { inflows: Map<string, FlowEntry>; outflows: Map<string, FlowEntry> } {
  const wallet = walletAddress.toLowerCase();
  const inflows = new Map<string, FlowEntry>();
  const outflows = new Map<string, FlowEntry>();
  const nativePrice = NATIVE_PRICE_USD[chainId] ?? 0;

  /* Helper to merge a transfer into the appropriate map. */
  function addFlow(
    target: Map<string, FlowEntry>,
    counterparty: string,
    approxUsd: number,
    txHash: string,
    description: string,
  ) {
    const existing = target.get(counterparty);
    if (existing) {
      existing.approxUsd += approxUsd;
      /* Keep the most recent tx hash (txs are sorted desc, first wins). */
      /* Combine descriptions — but cap to avoid run-on text. */
      const combined = existing.description + " + " + description;
      existing.description = combined.length > 80
        ? existing.description // ignore if too long
        : combined;
    } else {
      target.set(counterparty, {
        address: counterparty,
        approxUsd,
        lastTx: txHash,
        description,
      });
    }
  }

  /* Process native ETH transfers. */
  for (const tx of txs.native) {
    const ts = parseInt(tx.timeStamp ?? "0", 10) * 1000;
    if (!Number.isFinite(ts) || ts < cutoffTs) continue;
    if (!tx.from || !tx.to || !tx.value || !tx.hash) continue;

    const from = tx.from.toLowerCase();
    const to = tx.to.toLowerCase();
    if (from === to) continue;

    const amount = weiToNative(tx.value);
    if (amount < 0.001) continue; // ignore dust

    /* Approximate USD using the chain's native asset price. */
    const approxUsd = amount * nativePrice;
    const description = `${amount.toFixed(4)} native`;

    if (to === wallet) {
      addFlow(inflows, from, approxUsd, tx.hash, description);
    } else if (from === wallet) {
      addFlow(outflows, to, approxUsd, tx.hash, description);
    }
  }

  /* Process token transfers. */
  for (const tx of txs.tokens) {
    const ts = parseInt(tx.timeStamp ?? "0", 10) * 1000;
    if (!Number.isFinite(ts) || ts < cutoffTs) continue;
    if (!tx.from || !tx.to || !tx.value || !tx.hash) continue;

    const from = tx.from.toLowerCase();
    const to = tx.to.toLowerCase();
    if (from === to) continue;

    const decimals = parseInt(tx.tokenDecimal ?? "18", 10);
    if (!Number.isFinite(decimals)) continue;

    let amount: number;
    try {
      const raw = BigInt(tx.value);
      const divisor = BigInt(10) ** BigInt(decimals);
      const whole = Number(raw / divisor);
      const frac = Number(raw % divisor) / Number(divisor);
      amount = whole + frac;
    } catch {
      continue;
    }
    if (amount <= 0) continue;

    const symbol = (tx.tokenSymbol ?? "").trim().toUpperCase();
    const heuristic = TOKEN_USD_HEURISTIC[symbol];
    /* Tokens not in our heuristic get a small nominal value so they
       still surface but rank below known-priced flows. */
    const approxUsd = heuristic ? amount * heuristic : Math.min(amount, 1000);
    if (approxUsd < 100) continue; // ignore micro-transfers

    /* Cap description so the UI doesn't get unwieldy. */
    const amountStr =
      amount >= 1000
        ? `${(amount / 1000).toFixed(1)}K`
        : amount >= 1
        ? amount.toFixed(2)
        : amount.toFixed(4);
    const description = `${amountStr} ${symbol || "tokens"}`;

    if (to === wallet) {
      addFlow(inflows, from, approxUsd, tx.hash, description);
    } else if (from === wallet) {
      addFlow(outflows, to, approxUsd, tx.hash, description);
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
  const cutoffTs = Date.now() - TRACE_LOOKBACK_MS;

  let currentAddress = origin.toLowerCase();
  let currentHop = 0;
  const visited = new Set<string>([currentAddress]);

  while (currentHop < MAX_HOPS) {
    const txs = await fetchAddressTxs(apiKey, chainId, currentAddress);
    if (txs.native.length === 0 && txs.tokens.length === 0) break;

    const { inflows, outflows } = summarizeFlow(
      txs,
      currentAddress,
      chainId,
      cutoffTs,
    );
    const flowMap = direction === "backward" ? inflows : outflows;
    if (flowMap.size === 0) break;

    /* Pick the largest counterparty by approximate USD value. */
    const sorted = [...flowMap.entries()].sort(
      (a, b) => b[1].approxUsd - a[1].approxUsd,
    );
    const [nextAddr, info] = sorted[0];

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
      /* `nativeAmount` is now overloaded to mean "transfer amount" —
         could be ETH or could be a token. The description field
         carries the actual unit. We keep the field name for backward
         compat with the existing UI component. */
      nativeAmount: 0, // not meaningful when token transfers are involved
      approxUsd: info.approxUsd,
      isTerminal,
      txHash: info.lastTx,
      explorerUrl: `${explorerBase}/address/${nextAddr}`,
      flowDescription: info.description,
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
    "Trace follows the largest single inflow/outflow per hop, including both native ETH and ERC20 token transfers. Smaller branching transfers are not shown.",
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
