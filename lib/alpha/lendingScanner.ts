/* ─────────────────────────────────────────────────────────────
   Lending Scanner — Aave V3

   Aave V3 is the dominant cross-chain lending protocol. We listen
   for two events:

   Borrow(reserve, user, onBehalfOf, amount, interestRateMode, borrowRate, referralCode)
   - Indexed: reserve (token), user, onBehalfOf, referralCode
   - Data: amount, interestRateMode, borrowRate

   LiquidationCall(collateralAsset, debtAsset, user, debtToCover, liquidatedCollateralAmount, liquidator, receiveAToken)
   - Indexed: collateralAsset, debtAsset, user
   - Data: debtToCover, liquidatedCollateralAmount, liquidator, receiveAToken

   These are signal-rich:
   - Large borrows can precede market manipulation or short attacks
   - Liquidations indicate stress in the system; large ones indicate
     whale positions getting wrecked

   We use Aave V3's main Pool contract per chain. Other protocols
   (Compound V3, Spark, etc.) follow the same pattern but with
   different addresses — easy to add later as additional sources.
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

/* topic0 = keccak256("Borrow(address,address,address,uint256,uint8,uint256,uint16)") */
const AAVE_BORROW_TOPIC =
  "0xb3d084820fb1a9decffb176436bd02558d15fac9b0ddfed8c465bc7359d7dce0";

/* topic0 = keccak256("LiquidationCall(address,address,address,uint256,uint256,address,bool)") */
const AAVE_LIQUIDATION_TOPIC =
  "0xe413a321e8681d831f4dbccbca790d2952b56f977908e45be37335533e005286";

/* Aave V3 Pool addresses per chain. These are stable
   protocol contracts — they don't move. */
const AAVE_V3_POOLS: Partial<Record<SupportedChain, string>> = {
  ethereum: "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2",
  polygon: "0x794a61358d6845594f94dc1db02a252b5b4814ad",
  arbitrum: "0x794a61358d6845594f94dc1db02a252b5b4814ad",
  optimism: "0x794a61358d6845594f94dc1db02a252b5b4814ad",
  base: "0xa238dd80c259a72e81d7e4664a9801593f98d1c5",
  /* BSC: Aave V3 on BSC is newer — currently the main Pool is at
     0x6807dc923806fE8Fd134338EABCA509979a7e0cB. Leaving this
     commented because BSC has more active alternative lenders
     (Venus) that we'd want to track first. */
};

const BLOCK_SPAN = 30;
const MAX_LOGS_PER_CHAIN = 500;
const MIN_LENDING_USD = 100_000; // lending is high-stakes; floor it accordingly

interface RawLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
}

async function fetchAaveLogs(
  chain: SupportedChain,
  poolAddress: string,
  fromBlock: number,
  toBlock: number,
): Promise<{ borrows: RawLog[]; liquidations: RawLog[] }> {
  const baseFilter = {
    address: poolAddress,
    fromBlock: toHexBlock(fromBlock),
    toBlock: toHexBlock(toBlock),
  };

  const [borrowsRes, liqRes] = await Promise.all([
    rpcCall<RawLog[]>(chain, "eth_getLogs", [
      { ...baseFilter, topics: [AAVE_BORROW_TOPIC] },
    ]),
    rpcCall<RawLog[]>(chain, "eth_getLogs", [
      { ...baseFilter, topics: [AAVE_LIQUIDATION_TOPIC] },
    ]),
  ]);

  return {
    borrows: Array.isArray(borrowsRes) ? borrowsRes.slice(0, MAX_LOGS_PER_CHAIN) : [],
    liquidations: Array.isArray(liqRes) ? liqRes.slice(0, MAX_LOGS_PER_CHAIN) : [],
  };
}

interface ParsedBorrow {
  reserve: string; // token being borrowed
  user: string;
  amountRaw: bigint;
  txHash: string;
  blockNumber: number;
}

function parseBorrow(log: RawLog): ParsedBorrow | null {
  /* indexed: reserve (1), user (2), onBehalfOf (3), referralCode (4)
     data: amount (uint256), interestRateMode (uint8), borrowRate (uint256) */
  if (log.topics.length < 5) return null;
  const data = log.data.startsWith("0x") ? log.data.slice(2) : log.data;
  if (data.length < 64) return null;
  return {
    reserve: parseAddressTopic(log.topics[1]),
    user: parseAddressTopic(log.topics[2]),
    amountRaw: parseUint256(data.slice(0, 64)),
    txHash: log.transactionHash,
    blockNumber: parseInt(log.blockNumber, 16),
  };
}

interface ParsedLiquidation {
  collateralAsset: string;
  debtAsset: string;
  user: string; // the liquidated borrower
  debtToCoverRaw: bigint;
  liquidatedCollateralRaw: bigint;
  liquidator: string;
  txHash: string;
  blockNumber: number;
}

function parseLiquidation(log: RawLog): ParsedLiquidation | null {
  /* indexed: collateralAsset (1), debtAsset (2), user (3)
     data: debtToCover (uint256), liquidatedCollateralAmount (uint256),
           liquidator (address), receiveAToken (bool) */
  if (log.topics.length < 4) return null;
  const data = log.data.startsWith("0x") ? log.data.slice(2) : log.data;
  if (data.length < 256) return null;
  /* Liquidator is the 3rd 32-byte word in data — extract last 20 bytes. */
  const liquidatorWord = data.slice(128, 192);
  const liquidator = ("0x" + liquidatorWord.slice(-40)).toLowerCase();
  return {
    collateralAsset: parseAddressTopic(log.topics[1]),
    debtAsset: parseAddressTopic(log.topics[2]),
    user: parseAddressTopic(log.topics[3]),
    debtToCoverRaw: parseUint256(data.slice(0, 64)),
    liquidatedCollateralRaw: parseUint256(data.slice(64, 128)),
    liquidator,
    txHash: log.transactionHash,
    blockNumber: parseInt(log.blockNumber, 16),
  };
}

/* ═══════════════════════════════════════════════════════════ */

interface ChainScanResult {
  activities: SuspiciousActivity[];
  totalEventsSeen: number;
}

async function scanAaveOnChain(
  chain: SupportedChain,
  tipBlock: number,
): Promise<ChainScanResult> {
  const cfg = CHAIN_CONFIG[chain];
  const poolAddr = AAVE_V3_POOLS[chain];
  if (!poolAddr) return { activities: [], totalEventsSeen: 0 };

  const fromBlock = Math.max(0, tipBlock - BLOCK_SPAN);
  const { borrows, liquidations } = await fetchAaveLogs(
    chain,
    poolAddr,
    fromBlock,
    tipBlock,
  );
  const totalEventsSeen = borrows.length + liquidations.length;
  if (totalEventsSeen === 0) return { activities: [], totalEventsSeen: 0 };

  /* Parse all events. */
  const parsedBorrows: ParsedBorrow[] = [];
  for (const log of borrows) {
    const p = parseBorrow(log);
    if (p) parsedBorrows.push(p);
  }
  const parsedLiqs: ParsedLiquidation[] = [];
  for (const log of liquidations) {
    const p = parseLiquidation(log);
    if (p) parsedLiqs.push(p);
  }

  /* Collect all unique tokens we need metadata + prices for. */
  const tokens = new Set<string>();
  for (const b of parsedBorrows) tokens.add(b.reserve);
  for (const l of parsedLiqs) {
    tokens.add(l.collateralAsset);
    tokens.add(l.debtAsset);
  }
  const tokenList = Array.from(tokens);
  const [meta, prices] = await Promise.all([
    resolveTokenMetadata(chain, tokenList),
    resolveTokenPrices(chain, tokenList),
  ]);

  const out: SuspiciousActivity[] = [];

  /* Process borrows */
  for (const b of parsedBorrows) {
    const m = meta.get(b.reserve);
    const p = prices.get(b.reserve);
    if (!m || !p) continue;
    const human = toHumanAmount(b.amountRaw, m.decimals);
    const usd = human * p;
    if (usd < MIN_LENDING_USD) continue;

    /* Severity scales with size — $100K floor, $5M = critical. */
    let severity: number;
    if (usd >= 5_000_000) severity = 95;
    else if (usd >= 1_000_000) severity = 70 + Math.min(20, (usd - 1_000_000) / 200_000);
    else severity = 40 + Math.min(25, (usd - MIN_LENDING_USD) / 36_000);

    const userLabel = getWalletLabel(cfg.chainId, b.user);
    const usdStr = usd >= 1_000_000 ? `$${(usd / 1_000_000).toFixed(2)}M` : `$${(usd / 1000).toFixed(0)}K`;

    out.push({
      id: `borrow-${b.txHash}-${b.user}`,
      category: "lending",
      txHash: b.txHash,
      blockNumber: b.blockNumber,
      timestamp: approxBlockTimestamp(chain, b.blockNumber),
      chain: cfg.name,
      chainId: cfg.chainId,
      tokenSymbol: m.symbol,
      tokenAddress: m.address,
      tokenName: m.name,
      contractAddress: poolAddr,
      contractLabel: "Aave V3",
      wallet: b.user,
      walletLabel: userLabel?.label,
      tokenAmount: human,
      amountUsd: usd,
      poolImpactPct: 0,
      severity: Math.round(severity),
      riskReasons: ["lending_borrow"],
      riskSummary: `${usdStr} ${m.symbol} borrowed from Aave V3`,
      txUrl: `${cfg.explorerBase}/tx/${b.txHash}`,
      walletUrl: `${cfg.explorerBase}/address/${b.user}`,
      contractUrl: `${cfg.explorerBase}/address/${poolAddr}`,
    });
  }

  /* Process liquidations */
  for (const l of parsedLiqs) {
    const debtMeta = meta.get(l.debtAsset);
    const debtPrice = prices.get(l.debtAsset);
    const collMeta = meta.get(l.collateralAsset);
    const collPrice = prices.get(l.collateralAsset);
    if (!debtMeta || !debtPrice) continue;

    const debtHuman = toHumanAmount(l.debtToCoverRaw, debtMeta.decimals);
    const debtUsd = debtHuman * debtPrice;
    if (debtUsd < MIN_LENDING_USD) continue;

    /* Liquidations always start at high severity — someone got wrecked.
       Magnitude scales it further. */
    let severity = 75;
    if (debtUsd >= 1_000_000) severity = 90 + Math.min(10, (debtUsd - 1_000_000) / 250_000);
    else severity += Math.min(15, (debtUsd - MIN_LENDING_USD) / 60_000);

    const userLabel = getWalletLabel(cfg.chainId, l.user);
    const collateralStr = collMeta && collPrice
      ? ` (collateral: ${collMeta.symbol})`
      : "";
    const usdStr =
      debtUsd >= 1_000_000 ? `$${(debtUsd / 1_000_000).toFixed(2)}M` : `$${(debtUsd / 1000).toFixed(0)}K`;

    out.push({
      id: `liq-${l.txHash}-${l.user}`,
      category: "lending",
      txHash: l.txHash,
      blockNumber: l.blockNumber,
      timestamp: approxBlockTimestamp(chain, l.blockNumber),
      chain: cfg.name,
      chainId: cfg.chainId,
      tokenSymbol: debtMeta.symbol,
      tokenAddress: debtMeta.address,
      tokenName: debtMeta.name,
      contractAddress: poolAddr,
      contractLabel: "Aave V3",
      wallet: l.user,
      walletLabel: userLabel?.label,
      counterparty: l.liquidator,
      counterpartyLabel: getWalletLabel(cfg.chainId, l.liquidator)?.label,
      tokenAmount: debtHuman,
      amountUsd: debtUsd,
      poolImpactPct: 0,
      severity: Math.round(severity),
      riskReasons: ["liquidation"],
      riskSummary: `${usdStr} position liquidated on Aave V3${collateralStr}`,
      txUrl: `${cfg.explorerBase}/tx/${l.txHash}`,
      walletUrl: `${cfg.explorerBase}/address/${l.user}`,
      contractUrl: `${cfg.explorerBase}/address/${poolAddr}`,
    });
  }

  out.sort((a, b) => b.severity - a.severity);
  return { activities: out, totalEventsSeen };
}

/* ═══════════════════════════════════════════════════════════ */
/* Public entry                                                 */
/* ═══════════════════════════════════════════════════════════ */

export interface LendingScanResult {
  activities: SuspiciousActivity[];
  totalEventsSeen: number;
}

export async function scanLendingActivity(
  chains: SupportedChain[],
  tipBlocks: Map<SupportedChain, number>,
): Promise<LendingScanResult> {
  const results = await Promise.all(
    chains.map(async (chain) => {
      const tip = tipBlocks.get(chain);
      if (tip === undefined) return null;
      try {
        return await scanAaveOnChain(chain, tip);
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
