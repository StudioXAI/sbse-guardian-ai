/* ─────────────────────────────────────────────────────────────
   Liquidity Removal Scanner

   Detects LP withdrawals — when liquidity providers pull their
   capital out of a pool. This is the most direct rug-pull signal:
   project deployers withdrawing the seed liquidity is THE
   archetypal "rug".

   Two events of interest:

   Uniswap V2 Burn(sender, amount0, amount1, to)
   - Fired when LP tokens are burned (LP exiting the pool)
   - Indexed: sender, to
   - Data: amount0, amount1 (the underlying tokens returned)

   Uniswap V3 Burn(owner, tickLower, tickUpper, amount, amount0, amount1)
   - Fired when a V3 position is decreased
   - Indexed: owner, tickLower, tickUpper
   - Data: amount (LP units), amount0, amount1

   We surface withdrawals where the dollar value is significant
   and classify "lp_burn_full" if the amounts withdrawn represent
   most of the pool (likely a rug).
   ───────────────────────────────────────────────────────────── */

import {
  rpcCall,
  toHexBlock,
  CHAIN_CONFIG,
  type SupportedChain,
} from "./quicknodeClient";
import { resolveTokenMetadata } from "./tokenMetadata";
import {
  parseUint256,
  parseAddressTopic,
  toHumanAmount,
  resolveTokenPrices,
  approxBlockTimestamp,
} from "./dexEventScanner";
import { getWalletLabel } from "./walletLabels";
import type { SuspiciousActivity, RiskReason } from "./threatTypes";

/* event Burn(address indexed sender, uint amount0, uint amount1, address indexed to)
   topic0 for V2 = keccak256("Burn(address,uint256,uint256,address)") */
const V2_BURN_TOPIC =
  "0xdccd412f0b1252819cb1fd330b93224ca42612892bb3f4f789976e6d81936496";

/* event Burn(address indexed owner, int24 indexed tickLower, int24 indexed tickUpper,
              uint128 amount, uint256 amount0, uint256 amount1)
   topic0 for V3 = keccak256("Burn(address,int24,int24,uint128,uint256,uint256)") */
const V3_BURN_TOPIC =
  "0x0c396cd989a39f4459b5fa1aed6a9a8dcdbc45908acfd67e028cd568da98982c";

const BLOCK_SPAN = 30;
const MAX_LOGS_PER_CHAIN = 2_000;

/* USD floor — only surface withdrawals where dollar value justifies
   user attention. */
const MIN_REMOVAL_USD = 25_000;

interface RawLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
}

async function fetchBurnLogs(
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
      { ...baseFilter, topics: [V2_BURN_TOPIC] },
    ]),
    rpcCall<RawLog[]>(chain, "eth_getLogs", [
      { ...baseFilter, topics: [V3_BURN_TOPIC] },
    ]),
  ]);

  return {
    v2: Array.isArray(v2Result) ? v2Result.slice(0, MAX_LOGS_PER_CHAIN) : [],
    v3: Array.isArray(v3Result) ? v3Result.slice(0, MAX_LOGS_PER_CHAIN) : [],
  };
}

interface ParsedBurn {
  poolAddress: string;
  /** sender (V2) or owner (V3) — the LP withdrawing. */
  withdrawer: string;
  /** Recipient of the withdrawn tokens (V2 only — V3 hands back to sender). */
  recipient: string;
  amount0: bigint;
  amount1: bigint;
  txHash: string;
  blockNumber: number;
  variant: "v2" | "v3";
}

function parseV2Burn(log: RawLog): ParsedBurn | null {
  if (log.topics.length < 3) return null;
  const data = log.data.startsWith("0x") ? log.data.slice(2) : log.data;
  if (data.length < 128) return null;
  return {
    poolAddress: log.address.toLowerCase(),
    withdrawer: parseAddressTopic(log.topics[1]),
    recipient: parseAddressTopic(log.topics[2]),
    amount0: parseUint256(data.slice(0, 64)),
    amount1: parseUint256(data.slice(64, 128)),
    txHash: log.transactionHash,
    blockNumber: parseInt(log.blockNumber, 16),
    variant: "v2",
  };
}

function parseV3Burn(log: RawLog): ParsedBurn | null {
  if (log.topics.length < 4) return null;
  const data = log.data.startsWith("0x") ? log.data.slice(2) : log.data;
  /* V3 Burn data: amount (uint128, but ABI-encoded as 32 bytes),
                  amount0 (uint256), amount1 (uint256) = 96 hex bytes. */
  if (data.length < 192) return null;
  return {
    poolAddress: log.address.toLowerCase(),
    withdrawer: parseAddressTopic(log.topics[1]),
    recipient: parseAddressTopic(log.topics[1]), // V3 sends back to owner
    /* Skip the "amount" LP-units field at slice(0,64); read amount0 and amount1. */
    amount0: parseUint256(data.slice(64, 128)),
    amount1: parseUint256(data.slice(128, 192)),
    txHash: log.transactionHash,
    blockNumber: parseInt(log.blockNumber, 16),
    variant: "v3",
  };
}

/* Pool's token0/token1 lookup — same selectors as dexEventScanner. */
const POOL_TOKEN0_SELECTOR = "0x0dfe1681";
const POOL_TOKEN1_SELECTOR = "0xd21220a7";

interface PoolTokens {
  token0: string;
  token1: string;
}

async function resolvePoolTokenPairs(
  chain: SupportedChain,
  pools: string[],
): Promise<Map<string, PoolTokens>> {
  const out = new Map<string, PoolTokens>();
  if (pools.length === 0) return out;

  const { rpcBatch } = await import("./quicknodeClient");
  const requests: Array<{ method: string; params: unknown[] }> = [];
  for (const pool of pools) {
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
  for (let i = 0; i < pools.length; i++) {
    const t0 = results[i * 2];
    const t1 = results[i * 2 + 1];
    if (!t0 || !t1 || typeof t0 !== "string" || typeof t1 !== "string") continue;
    const s0 = t0.startsWith("0x") ? t0.slice(2) : t0;
    const s1 = t1.startsWith("0x") ? t1.slice(2) : t1;
    if (s0.length < 40 || s1.length < 40) continue;
    const token0 = ("0x" + s0.slice(-40)).toLowerCase();
    const token1 = ("0x" + s1.slice(-40)).toLowerCase();
    if (token0 === "0x0000000000000000000000000000000000000000") continue;
    if (token1 === "0x0000000000000000000000000000000000000000") continue;
    out.set(pools[i], { token0, token1 });
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════ */
/* Per-chain scan                                               */
/* ═══════════════════════════════════════════════════════════ */

interface ChainScanResult {
  activities: SuspiciousActivity[];
  totalEventsSeen: number;
}

async function scanRemovalsOnChain(
  chain: SupportedChain,
  tipBlock: number,
): Promise<ChainScanResult> {
  const cfg = CHAIN_CONFIG[chain];
  const fromBlock = Math.max(0, tipBlock - BLOCK_SPAN);

  const { v2, v3 } = await fetchBurnLogs(chain, fromBlock, tipBlock);
  const totalEventsSeen = v2.length + v3.length;
  if (totalEventsSeen === 0) return { activities: [], totalEventsSeen: 0 };

  const parsed: ParsedBurn[] = [];
  for (const log of v2) {
    const p = parseV2Burn(log);
    if (p) parsed.push(p);
  }
  for (const log of v3) {
    const p = parseV3Burn(log);
    if (p) parsed.push(p);
  }
  if (parsed.length === 0) return { activities: [], totalEventsSeen };

  /* Resolve pool tokens. */
  const uniquePools = Array.from(new Set(parsed.map((p) => p.poolAddress)));
  const poolTokens = await resolvePoolTokenPairs(chain, uniquePools);

  /* Resolve token metadata + prices. */
  const allTokens = new Set<string>();
  for (const pt of poolTokens.values()) {
    allTokens.add(pt.token0);
    allTokens.add(pt.token1);
  }
  const tokenList = Array.from(allTokens);
  const [tokenMeta, tokenPrices] = await Promise.all([
    resolveTokenMetadata(chain, tokenList),
    resolveTokenPrices(chain, tokenList),
  ]);

  /* Build activity records. */
  const out: SuspiciousActivity[] = [];
  for (const burn of parsed) {
    const pt = poolTokens.get(burn.poolAddress);
    if (!pt) continue;
    const meta0 = tokenMeta.get(pt.token0);
    const meta1 = tokenMeta.get(pt.token1);
    if (!meta0 || !meta1) continue;
    const p0 = tokenPrices.get(pt.token0);
    const p1 = tokenPrices.get(pt.token1);

    const amount0Human = toHumanAmount(burn.amount0, meta0.decimals);
    const amount1Human = toHumanAmount(burn.amount1, meta1.decimals);
    const usd0 = p0 ? amount0Human * p0 : 0;
    const usd1 = p1 ? amount1Human * p1 : 0;
    const totalUsd = usd0 + usd1;

    /* Skip if neither side is priced or total below threshold. */
    if (totalUsd < MIN_REMOVAL_USD) continue;

    /* Pick the more notable side as "primary" for display. Larger
       USD wins. If both unpriced, fallback to side with larger token amount. */
    let primaryMeta = meta0;
    let primaryAmount = amount0Human;
    if (usd1 > usd0) {
      primaryMeta = meta1;
      primaryAmount = amount1Human;
    } else if (usd0 === 0 && usd1 === 0 && amount1Human > amount0Human) {
      primaryMeta = meta1;
      primaryAmount = amount1Human;
    }

    /* Severity scales with USD removed. $25K = 35, $250K = 65, $1M+ = 90. */
    let severity: number;
    if (totalUsd >= 1_000_000) severity = 90 + Math.min(10, (totalUsd - 1_000_000) / 200_000);
    else if (totalUsd >= 250_000) severity = 65 + Math.min(25, (totalUsd - 250_000) / 30_000);
    else severity = 35 + Math.min(30, (totalUsd - MIN_REMOVAL_USD) / 7_500);

    const reasons: RiskReason[] = ["lp_withdrawal"];
    const withdrawerLabel = getWalletLabel(cfg.chainId, burn.withdrawer);
    if (withdrawerLabel?.category === "team") {
      reasons.push("treasury_outflow");
      severity = Math.min(100, severity + 15);
    }

    /* Build summary. */
    const usdStr =
      totalUsd >= 1_000_000
        ? `$${(totalUsd / 1_000_000).toFixed(2)}M`
        : `$${(totalUsd / 1000).toFixed(0)}K`;
    const variant = burn.variant === "v2" ? "Uniswap V2" : "Uniswap V3";
    const teamFlag = withdrawerLabel?.category === "team" ? " (team wallet — investigate)" : "";
    const summary = `${usdStr} of liquidity withdrawn from ${variant} ${meta0.symbol}/${meta1.symbol} pool${teamFlag}`;

    out.push({
      id: `lp-${burn.txHash}-${burn.poolAddress}`,
      category: "liquidity_removal",
      txHash: burn.txHash,
      blockNumber: burn.blockNumber,
      timestamp: approxBlockTimestamp(chain, burn.blockNumber),
      chain: cfg.name,
      chainId: cfg.chainId,
      tokenSymbol: `${meta0.symbol}/${meta1.symbol}`,
      tokenAddress: primaryMeta.address,
      tokenName: `${meta0.name} / ${meta1.name}`,
      contractAddress: burn.poolAddress,
      contractLabel: variant,
      wallet: burn.withdrawer,
      walletLabel: withdrawerLabel?.label,
      tokenAmount: primaryAmount,
      amountUsd: totalUsd > 0 ? totalUsd : null,
      poolImpactPct: 0, // not directly comparable to swap impact
      severity: Math.round(severity),
      riskReasons: reasons,
      riskSummary: summary,
      txUrl: `${cfg.explorerBase}/tx/${burn.txHash}`,
      walletUrl: `${cfg.explorerBase}/address/${burn.withdrawer}`,
      contractUrl: `${cfg.explorerBase}/address/${burn.poolAddress}`,
    });
  }

  out.sort((a, b) => b.severity - a.severity);
  return { activities: out, totalEventsSeen };
}

/* ═══════════════════════════════════════════════════════════ */
/* Public entry                                                 */
/* ═══════════════════════════════════════════════════════════ */

export interface RemovalScanResult {
  activities: SuspiciousActivity[];
  totalEventsSeen: number;
}

export async function scanLiquidityRemovals(
  chains: SupportedChain[],
  tipBlocks: Map<SupportedChain, number>,
): Promise<RemovalScanResult> {
  const results = await Promise.all(
    chains.map(async (chain) => {
      const tip = tipBlocks.get(chain);
      if (tip === undefined) return null;
      try {
        return await scanRemovalsOnChain(chain, tip);
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
  return { activities: all.slice(0, 8), totalEventsSeen: totalEvents };
}
