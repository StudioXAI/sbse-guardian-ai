/* ─────────────────────────────────────────────────────────────
   Transfer Scanner — large ERC20 transfer detection

   Pulls every ERC20 Transfer event in the last ~30 blocks across
   enabled chains, filters by $50K+ USD threshold, and classifies
   each transfer based on what we know about the addresses
   involved:

   - To = known CEX     → "exchange_deposit"  (often pre-sell)
   - From = known CEX   → "exchange_withdrawal"
   - From = team/treasury → "treasury_outflow" (worth watching)
   - From OR to labeled → "labeled_wallet_activity"
   - Otherwise          → "large_transfer"

   COST DISCIPLINE:
   - One eth_getLogs call per chain per scan
   - 30-block window typically returns 3,000-5,000 Transfer events
   - We filter by USD threshold BEFORE doing any per-row enrichment
   - Token metadata + prices are cached (per the existing modules)
   - Steady-state per-scan cost: ~5 RPC calls + ~1 CoinGecko call

   First scan after deploy is expensive (resolves hundreds of
   tokens). Subsequent scans are fast (cache hits dominate).
   ───────────────────────────────────────────────────────────── */

import {
  rpcCall,
  toHexBlock,
  CHAIN_CONFIG,
  type SupportedChain,
} from "./quicknodeClient";
import { resolveTokenMetadata, type TokenMetadata } from "./tokenMetadata";
import {
  parseUint256,
  parseAddressTopic,
  toHumanAmount,
  resolveTokenPrices,
  approxBlockTimestamp,
} from "./dexEventScanner";
import { getWalletLabel, getWalletCategory } from "./walletLabels";
import type { SuspiciousActivity, RiskReason } from "./threatTypes";

/* ERC-20 Transfer event:
   event Transfer(address indexed from, address indexed to, uint256 value);
   topic0 = keccak256("Transfer(address,address,uint256)") */
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

/* Same-block burn events use this topic too — Transfer(from, 0x0, value)
   represents a burn. We surface those as part of the regular flow. */

const BLOCK_SPAN = 30;

/* Hard cap on logs to avoid RAM blow-up in the rare case of a chain
   spike. 50K is enough for ~10x normal activity windows. */
const MAX_LOGS_PER_CHAIN = 50_000;

/* USD threshold for surfacing a transfer at all. Below this, we don't
   even resolve token metadata or run classification. */
const MIN_TRANSFER_USD = 50_000;

/* Top-N transfers per chain per scan — caps how many records we
   return, keeps memory and downstream sort costs bounded. */
const TOP_PER_CHAIN = 50;

interface RawLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
}

/**
 * Fetch all ERC20 Transfer events in a block range. One call per
 * chain — Transfer is the most common event on any EVM chain so
 * this is the largest single payload we pull anywhere.
 */
async function fetchTransferLogs(
  chain: SupportedChain,
  fromBlock: number,
  toBlock: number,
): Promise<RawLog[]> {
  const result = await rpcCall<RawLog[]>(chain, "eth_getLogs", [
    {
      fromBlock: toHexBlock(fromBlock),
      toBlock: toHexBlock(toBlock),
      topics: [TRANSFER_TOPIC],
    },
  ]);
  if (!Array.isArray(result)) return [];
  return result.slice(0, MAX_LOGS_PER_CHAIN);
}

interface ParsedTransfer {
  tokenContract: string;
  from: string;
  to: string;
  rawValue: bigint;
  txHash: string;
  blockNumber: number;
}

/**
 * Parse a Transfer log into a structured record. Returns null if
 * the log doesn't match the standard 3-topic Transfer signature
 * (some non-standard tokens omit the value or use bytes32).
 */
function parseTransferLog(log: RawLog): ParsedTransfer | null {
  if (log.topics.length < 3) return null;
  const data = log.data.startsWith("0x") ? log.data.slice(2) : log.data;
  /* Value is a single uint256 in the data field. */
  if (data.length < 64) return null;

  const rawValue = parseUint256(data.slice(0, 64));
  if (rawValue === BigInt(0)) return null;

  return {
    tokenContract: log.address.toLowerCase(),
    from: parseAddressTopic(log.topics[1]),
    to: parseAddressTopic(log.topics[2]),
    rawValue,
    txHash: log.transactionHash,
    blockNumber: parseInt(log.blockNumber, 16),
  };
}

/* ═══════════════════════════════════════════════════════════ */
/* Classification                                               */
/* ═══════════════════════════════════════════════════════════ */

interface TransferClassification {
  reasons: RiskReason[];
  severity: number;
  summary: string;
}

function classifyTransfer(
  chainId: number,
  amountUsd: number,
  from: string,
  to: string,
): TransferClassification {
  const fromCat = getWalletCategory(chainId, from);
  const toCat = getWalletCategory(chainId, to);
  const fromLabel = getWalletLabel(chainId, from);
  const toLabel = getWalletLabel(chainId, to);

  const reasons: RiskReason[] = [];
  let severity = 0;

  /* Base: any $50K+ transfer is at least "large_transfer". */
  reasons.push("large_sell"); // generic large-movement marker

  /* Severity scales with amount — $50K = 30, $1M = 70, $10M+ = 100. */
  if (amountUsd >= 10_000_000) severity = 100;
  else if (amountUsd >= 1_000_000) severity = 70 + Math.min(20, (amountUsd - 1_000_000) / 500_000);
  else severity = 30 + Math.min(40, (amountUsd - MIN_TRANSFER_USD) / 25_000);

  /* CEX direction tells a story. */
  if (toCat === "cex") {
    reasons.push("exchange_deposit");
    severity = Math.min(100, severity + 10);
  }
  if (fromCat === "cex") {
    reasons.push("exchange_withdrawal");
    severity = Math.min(100, severity + 5);
  }

  /* Team/treasury outflow is the highest-signal classification —
     project insiders moving large sums is what users care about
     for rug detection. */
  if (fromCat === "team") {
    reasons.push("treasury_outflow");
    severity = Math.min(100, severity + 25);
  }

  /* Generic labeled-wallet activity flag if neither side is a CEX/team
     but at least one is labeled (whale, MEV bot, etc.). */
  if (
    (fromLabel || toLabel) &&
    !reasons.includes("exchange_deposit") &&
    !reasons.includes("exchange_withdrawal") &&
    !reasons.includes("treasury_outflow")
  ) {
    reasons.push("labeled_wallet_activity");
    severity = Math.min(100, severity + 5);
  }

  /* MEV bot specifically. */
  if (fromCat === "mev" || toCat === "mev") {
    reasons.push("mev_bot");
  }

  /* Build a plain-English summary based on the strongest signal. */
  const usdStr =
    amountUsd >= 1_000_000
      ? `$${(amountUsd / 1_000_000).toFixed(2)}M`
      : `$${(amountUsd / 1000).toFixed(0)}K`;

  let summary: string;
  if (reasons.includes("treasury_outflow")) {
    const teamName = fromLabel?.label ?? "team wallet";
    summary = `${usdStr} outflow from ${teamName} — worth investigating`;
  } else if (reasons.includes("exchange_deposit")) {
    const cexName = toLabel?.label ?? "CEX";
    summary = `${usdStr} deposited to ${cexName} — likely pre-sell positioning`;
  } else if (reasons.includes("exchange_withdrawal")) {
    const cexName = fromLabel?.label ?? "CEX";
    summary = `${usdStr} withdrawn from ${cexName} — buy or self-custody move`;
  } else if (reasons.includes("labeled_wallet_activity")) {
    const named = fromLabel?.label ?? toLabel?.label ?? "labeled wallet";
    summary = `${usdStr} transfer involving ${named}`;
  } else {
    summary = `${usdStr} transfer between unlabeled wallets`;
  }

  return { reasons, severity: Math.round(severity), summary };
}

/* ═══════════════════════════════════════════════════════════ */
/* Per-chain scan                                               */
/* ═══════════════════════════════════════════════════════════ */

interface ChainScanResult {
  activities: SuspiciousActivity[];
  totalEventsSeen: number;
}

async function scanTransfersOnChain(
  chain: SupportedChain,
  tipBlock: number,
): Promise<ChainScanResult> {
  const cfg = CHAIN_CONFIG[chain];
  const fromBlock = Math.max(0, tipBlock - BLOCK_SPAN);

  /* 1. Pull all Transfer events. */
  const logs = await fetchTransferLogs(chain, fromBlock, tipBlock);
  const totalEventsSeen = logs.length;
  if (logs.length === 0) {
    return { activities: [], totalEventsSeen: 0 };
  }

  /* 2. Parse all logs. */
  const parsed: ParsedTransfer[] = [];
  for (const log of logs) {
    const p = parseTransferLog(log);
    if (p) parsed.push(p);
  }
  if (parsed.length === 0) {
    return { activities: [], totalEventsSeen };
  }

  /* 3. Resolve token metadata for every unique contract.
        This batches into a single HTTP round-trip via JSON-RPC
        batching — even for 500 unique tokens that's ~1 second. */
  const uniqueTokens = Array.from(new Set(parsed.map((p) => p.tokenContract)));
  const [tokenMeta, tokenPrices] = await Promise.all([
    resolveTokenMetadata(chain, uniqueTokens),
    resolveTokenPrices(chain, uniqueTokens),
  ]);

  /* 4. Filter by USD threshold and build activity records. */
  const candidates: SuspiciousActivity[] = [];
  for (const t of parsed) {
    const meta = tokenMeta.get(t.tokenContract);
    if (!meta) continue; // unresolvable token — skip
    const price = tokenPrices.get(t.tokenContract);
    if (!price) continue; // unpriced — can't apply USD threshold honestly

    const human = toHumanAmount(t.rawValue, meta.decimals);
    const amountUsd = human * price;
    if (amountUsd < MIN_TRANSFER_USD) continue;

    /* Skip mints (from = 0x0) and burns (to = 0x0) — those are
       supply changes, not value movements. They have their own
       category in liquidityRemovalScanner if we ever care. */
    if (t.from === "0x0000000000000000000000000000000000000000") continue;
    if (t.to === "0x0000000000000000000000000000000000000000") continue;

    /* Skip self-transfers (rare but they exist as no-ops). */
    if (t.from === t.to) continue;

    const cls = classifyTransfer(cfg.chainId, amountUsd, t.from, t.to);
    /* Minimum severity floor — surface only meaningful records. */
    if (cls.severity < 30) continue;

    const fromLabel = getWalletLabel(cfg.chainId, t.from);
    const toLabel = getWalletLabel(cfg.chainId, t.to);

    candidates.push({
      id: `xfer-${t.txHash}-${t.tokenContract}-${t.from}`,
      category: "large_transfer",
      txHash: t.txHash,
      blockNumber: t.blockNumber,
      timestamp: approxBlockTimestamp(chain, t.blockNumber),
      chain: cfg.name,
      chainId: cfg.chainId,
      tokenSymbol: meta.symbol,
      tokenAddress: meta.address,
      tokenName: meta.name,
      contractAddress: meta.address,
      contractLabel: meta.symbol,
      wallet: t.from,
      walletLabel: fromLabel?.label,
      counterparty: t.to,
      counterpartyLabel: toLabel?.label,
      tokenAmount: human,
      amountUsd,
      poolImpactPct: 0, // not applicable for raw transfers
      severity: cls.severity,
      riskReasons: cls.reasons,
      riskSummary: cls.summary,
      txUrl: `${cfg.explorerBase}/tx/${t.txHash}`,
      walletUrl: `${cfg.explorerBase}/address/${t.from}`,
      contractUrl: `${cfg.explorerBase}/address/${meta.address}`,
    });
  }

  /* 5. Sort by severity desc, take top N per chain. */
  candidates.sort((a, b) => b.severity - a.severity);
  return {
    activities: candidates.slice(0, TOP_PER_CHAIN),
    totalEventsSeen,
  };
}

/* ═══════════════════════════════════════════════════════════ */
/* Public entry — orchestrator calls this                       */
/* ═══════════════════════════════════════════════════════════ */

export interface TransferScanResult {
  activities: SuspiciousActivity[];
  totalEventsSeen: number;
}

export async function scanLargeTransfers(
  chains: SupportedChain[],
  tipBlocks: Map<SupportedChain, number>,
): Promise<TransferScanResult> {
  const results = await Promise.all(
    chains.map(async (chain) => {
      const tip = tipBlocks.get(chain);
      if (tip === undefined) return null;
      try {
        return await scanTransfersOnChain(chain, tip);
      } catch {
        return null;
      }
    }),
  );

  const all: SuspiciousActivity[] = [];
  let totalEvents = 0;
  for (const r of results) {
    if (!r) continue;
    all.push(...r.activities);
    totalEvents += r.totalEventsSeen;
  }
  all.sort((a, b) => b.severity - a.severity);
  return {
    activities: all.slice(0, 8), // top 8 across all chains
    totalEventsSeen: totalEvents,
  };
}
