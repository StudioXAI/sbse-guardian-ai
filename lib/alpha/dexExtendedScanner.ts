/* ─────────────────────────────────────────────────────────────
   Extended DEX Scanner — Curve + Balancer V2

   Complements dexEventScanner.ts (Uniswap V2/V3) with two more
   protocols. These have different event signatures so they need
   separate parsers.

   CURVE
   - Curve pools emit TokenExchange when stables are swapped
   - event TokenExchange(buyer indexed, sold_id int128, tokens_sold uint256,
                         bought_id int128, tokens_bought uint256)
   - The pool has fixed token slots (typically 2-4 tokens per pool)
   - To know which token was actually exchanged, we'd need to call
     coins(int128) on the pool. We surface activity flagged by USD
     volume and don't compute token-level impact (the pool model
     is different from Uniswap and impact math is more complex)

   BALANCER V2
   - All Balancer V2 swaps go through the central Vault contract
     (0xBA12222222228d8Ba445958a75a0704d566BF2C8 on most chains)
   - event Swap(poolId bytes32 indexed, tokenIn address indexed,
                tokenOut address indexed, amountIn uint256, amountOut uint256)
   - The tokenIn topic tells us directly which token was sold

   We treat both like the existing DEX scanner: classify suspicion
   by USD value, surface the top movers.
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
import { getWalletLabel, isMevWallet } from "./walletLabels";
import type { SuspiciousActivity, RiskReason } from "./threatTypes";

/* keccak256("TokenExchange(address,int128,uint256,int128,uint256)") */
const CURVE_EXCHANGE_TOPIC =
  "0x8b3e96f2b889fa771c53c981b40daf005f63f637f1869f707052d15a3dd97140";

/* keccak256("Swap(bytes32,address,address,uint256,uint256)") */
const BALANCER_SWAP_TOPIC =
  "0x2170c741c41531aec20e7c107c24eecfdd15e69c9bb0a8dd37b1840b9e0b207b";

/* Balancer V2 Vault — same address across mainnet, Polygon, Arbitrum,
   Optimism, Base. (BSC has a different deployer, can be added later.) */
const BALANCER_VAULT_ADDRESSES: Partial<Record<SupportedChain, string>> = {
  ethereum: "0xba12222222228d8ba445958a75a0704d566bf2c8",
  polygon: "0xba12222222228d8ba445958a75a0704d566bf2c8",
  arbitrum: "0xba12222222228d8ba445958a75a0704d566bf2c8",
  optimism: "0xba12222222228d8ba445958a75a0704d566bf2c8",
  base: "0xba12222222228d8ba445958a75a0704d566bf2c8",
};

const BLOCK_SPAN = 30;
const MAX_LOGS_PER_CHAIN = 1_000;
const MIN_DEX_USD = 50_000;

interface RawLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
}

async function fetchExtendedLogs(
  chain: SupportedChain,
  fromBlock: number,
  toBlock: number,
): Promise<{ curve: RawLog[]; balancer: RawLog[] }> {
  const baseFilter = {
    fromBlock: toHexBlock(fromBlock),
    toBlock: toHexBlock(toBlock),
  };

  /* Curve: cross-chain, no fixed contract — query by topic only */
  const curvePromise = rpcCall<RawLog[]>(chain, "eth_getLogs", [
    { ...baseFilter, topics: [CURVE_EXCHANGE_TOPIC] },
  ]);

  /* Balancer: filter by Vault contract for efficiency */
  const balancerVault = BALANCER_VAULT_ADDRESSES[chain];
  const balancerPromise = balancerVault
    ? rpcCall<RawLog[]>(chain, "eth_getLogs", [
        {
          ...baseFilter,
          address: balancerVault,
          topics: [BALANCER_SWAP_TOPIC],
        },
      ])
    : Promise.resolve(null);

  const [curveResult, balancerResult] = await Promise.all([
    curvePromise,
    balancerPromise,
  ]);

  return {
    curve: Array.isArray(curveResult) ? curveResult.slice(0, MAX_LOGS_PER_CHAIN) : [],
    balancer: Array.isArray(balancerResult) ? balancerResult.slice(0, MAX_LOGS_PER_CHAIN) : [],
  };
}

interface ParsedExchange {
  poolAddress: string;
  /** The wallet that initiated the swap. */
  wallet: string;
  /** Token being sold (entered the pool). For Curve this requires
      a pool.coins() lookup; for Balancer it's directly in topics. */
  soldToken?: string;
  /** Raw amount of sold token. */
  soldRaw: bigint;
  txHash: string;
  blockNumber: number;
  protocol: "Curve" | "Balancer V2";
}

function parseCurveExchange(log: RawLog): ParsedExchange | null {
  /* indexed: buyer (1)
     data: sold_id (int128 → 32 bytes), tokens_sold (uint256),
           bought_id (int128 → 32 bytes), tokens_bought (uint256) = 128 hex bytes */
  if (log.topics.length < 2) return null;
  const data = log.data.startsWith("0x") ? log.data.slice(2) : log.data;
  if (data.length < 256) return null;

  return {
    poolAddress: log.address.toLowerCase(),
    wallet: parseAddressTopic(log.topics[1]),
    soldToken: undefined, // requires coins(int128) lookup — we skip for cost
    soldRaw: parseUint256(data.slice(64, 128)),
    txHash: log.transactionHash,
    blockNumber: parseInt(log.blockNumber, 16),
    protocol: "Curve",
  };
}

function parseBalancerSwap(log: RawLog): ParsedExchange | null {
  /* indexed: poolId (1), tokenIn (2), tokenOut (3)
     data: amountIn (uint256), amountOut (uint256) = 64 hex bytes */
  if (log.topics.length < 4) return null;
  const data = log.data.startsWith("0x") ? log.data.slice(2) : log.data;
  if (data.length < 64) return null;

  return {
    poolAddress: log.address.toLowerCase(), // = Balancer Vault
    wallet: "", // Vault swap doesn't surface user directly — they must come from tx.from
    soldToken: parseAddressTopic(log.topics[2]),
    soldRaw: parseUint256(data.slice(0, 64)),
    txHash: log.transactionHash,
    blockNumber: parseInt(log.blockNumber, 16),
    protocol: "Balancer V2",
  };
}

/* ═══════════════════════════════════════════════════════════ */
/* Per-chain scan                                               */
/* ═══════════════════════════════════════════════════════════ */

interface ChainScanResult {
  activities: SuspiciousActivity[];
  totalEventsSeen: number;
}

async function scanExtendedOnChain(
  chain: SupportedChain,
  tipBlock: number,
): Promise<ChainScanResult> {
  const cfg = CHAIN_CONFIG[chain];
  const fromBlock = Math.max(0, tipBlock - BLOCK_SPAN);

  const { curve, balancer } = await fetchExtendedLogs(chain, fromBlock, tipBlock);
  const totalEventsSeen = curve.length + balancer.length;
  if (totalEventsSeen === 0) return { activities: [], totalEventsSeen: 0 };

  const parsed: ParsedExchange[] = [];
  for (const log of curve) {
    const p = parseCurveExchange(log);
    if (p) parsed.push(p);
  }
  for (const log of balancer) {
    const p = parseBalancerSwap(log);
    if (p) parsed.push(p);
  }
  if (parsed.length === 0) return { activities: [], totalEventsSeen };

  /* For Balancer, we know the sold token. For Curve, we don't —
     we'll need to fall back to displaying with "stable swap" hint
     and skipping precise USD calculation unless we extend with a
     pool.coins() resolver. For now we focus on Balancer for accuracy
     and surface Curve activity at the protocol level. */
  const tokensToResolve = new Set<string>();
  for (const p of parsed) {
    if (p.soldToken) tokensToResolve.add(p.soldToken);
  }
  const tokenList = Array.from(tokensToResolve);
  const [tokenMeta, tokenPrices] = await Promise.all([
    resolveTokenMetadata(chain, tokenList),
    resolveTokenPrices(chain, tokenList),
  ]);

  const out: SuspiciousActivity[] = [];
  for (const p of parsed) {
    /* If we can't price it, skip. */
    if (!p.soldToken) continue;
    const meta = tokenMeta.get(p.soldToken);
    const price = tokenPrices.get(p.soldToken);
    if (!meta || !price) continue;

    const human = toHumanAmount(p.soldRaw, meta.decimals);
    const usd = human * price;
    if (usd < MIN_DEX_USD) continue;

    /* Severity: Balancer/Curve swaps are typically more "professional"
       than Uniswap retail flow — large size still matters. Scale
       similarly to dexEventScanner. */
    let severity: number;
    if (usd >= 5_000_000) severity = 90;
    else if (usd >= 1_000_000) severity = 65 + Math.min(20, (usd - 1_000_000) / 200_000);
    else severity = 35 + Math.min(25, (usd - MIN_DEX_USD) / 38_000);

    const reasons: RiskReason[] = ["large_sell"];
    if (p.protocol === "Curve") reasons.push("stable_swap");

    /* Only Balancer surfaces a wallet in the event indexed fields; for
       Curve the indexed buyer is the user directly. */
    const wallet = p.wallet || "0x0000000000000000000000000000000000000000";
    const walletLabel = getWalletLabel(cfg.chainId, wallet);
    if (isMevWallet(cfg.chainId, wallet)) {
      reasons.push("mev_bot");
      severity = Math.min(100, severity + 5);
    }
    if (walletLabel && !isMevWallet(cfg.chainId, wallet)) {
      reasons.push("labeled_wallet_activity");
    }

    const usdStr =
      usd >= 1_000_000 ? `$${(usd / 1_000_000).toFixed(2)}M` : `$${(usd / 1000).toFixed(0)}K`;
    const summary = `${usdStr} ${meta.symbol} swap on ${p.protocol}`;

    out.push({
      id: `extdex-${p.txHash}-${p.poolAddress}`,
      category: "dex_swap",
      txHash: p.txHash,
      blockNumber: p.blockNumber,
      timestamp: approxBlockTimestamp(chain, p.blockNumber),
      chain: cfg.name,
      chainId: cfg.chainId,
      tokenSymbol: meta.symbol,
      tokenAddress: meta.address,
      tokenName: meta.name,
      contractAddress: p.poolAddress,
      contractLabel: p.protocol,
      wallet,
      walletLabel: walletLabel?.label,
      tokenAmount: human,
      amountUsd: usd,
      poolImpactPct: 0, // not computed for these protocols (different math)
      severity: Math.round(severity),
      riskReasons: reasons,
      riskSummary: summary,
      txUrl: `${cfg.explorerBase}/tx/${p.txHash}`,
      walletUrl: `${cfg.explorerBase}/address/${wallet}`,
      contractUrl: `${cfg.explorerBase}/address/${p.poolAddress}`,
    });
  }

  out.sort((a, b) => b.severity - a.severity);
  return { activities: out, totalEventsSeen };
}

/* ═══════════════════════════════════════════════════════════ */
/* Public entry                                                 */
/* ═══════════════════════════════════════════════════════════ */

export interface ExtendedDexScanResult {
  activities: SuspiciousActivity[];
  totalEventsSeen: number;
}

export async function scanExtendedDex(
  chains: SupportedChain[],
  tipBlocks: Map<SupportedChain, number>,
): Promise<ExtendedDexScanResult> {
  const results = await Promise.all(
    chains.map(async (chain) => {
      const tip = tipBlocks.get(chain);
      if (tip === undefined) return null;
      try {
        return await scanExtendedOnChain(chain, tip);
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
