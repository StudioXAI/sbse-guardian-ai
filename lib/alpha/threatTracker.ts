/* ─────────────────────────────────────────────────────────────
   Threat Tracker — orchestrator

   Combines two detection layers:

   1. Suspicious sells: discovered via whole-chain DEX event scan
      (dexEventScanner.ts → QuickNode RPC). No hardcoded token list.

   2. Risk events: dangerous function calls (mint, transferOwnership,
      removeLiquidity etc.) on contracts we know about — kept for
      now as a complement to live sell detection. This portion still
      uses Etherscan + a small token list since whole-chain
      function-call decoding is expensive and largely covered by
      DEX event surveillance for sell-side risk.

   The combined payload feeds the existing /api/alpha/threats route
   and the existing UI panels in components/alpha/.
   ───────────────────────────────────────────────────────────── */

import { TtlCache } from "./cache";
import {
  scanForSuspiciousActivity,
  type SuspiciousActivity,
  type RiskReason,
} from "./dexEventScanner";
import { getEnabledChains } from "./quicknodeClient";
import {
  decodeRiskFunction,
  severityWeight,
  type RiskSeverity,
} from "./riskFunctions";
import { getWalletLabel } from "./walletLabels";

const CACHE_TTL_MS = 90_000;
const REQUEST_TIMEOUT_MS = 12_000;
const ETHERSCAN_V2 = "https://api.etherscan.io/v2/api";

/* ═══════════════════════════════════════════════════════════ */
/* Public types                                                 */
/* ═══════════════════════════════════════════════════════════ */

/* SuspiciousSell now mirrors the SuspiciousActivity shape from the
   scanner with one renaming for the UI panel's existing prop name. */
export interface SuspiciousSell {
  id: string;
  txHash: string;
  blockNumber: number;
  timestamp: number;
  chain: string;
  chainId: number;
  /** Token that was sold. */
  symbol: string;
  tokenAddress: string;
  tokenName: string;
  /** Wallet that initiated the sell. */
  sellerAddress: string;
  sellerLabel?: string;
  /** Pool the sell hit. */
  poolAddress: string;
  poolLabel: string; // e.g. "Uniswap V3" or labeled pool
  /** Token amount sold in human units. */
  tokenAmount: number;
  /** USD value (null = unpriced micro-cap). */
  amountUsd: number | null;
  /** % of pool drained. */
  poolImpactPct: number;
  /** Severity score 0-100. */
  severity: number;
  /** Multi-class risk reasons, e.g. ["liquidity_drain","mev_bot"]. */
  riskReasons: RiskReason[];
  /** Plain-English summary. */
  riskSummary: string;
  /** Block explorer URLs. */
  txUrl: string;
  sellerUrl: string;
  poolUrl: string;
}

export interface RiskEvent {
  id: string;
  txHash: string;
  chain: string;
  chainId: number;
  functionName: string;
  signature: string;
  severity: RiskSeverity;
  description: string;
  callerAddress: string;
  callerLabel?: string;
  targetAddress: string;
  targetLabel?: string;
  symbol?: string;
  txUrl: string;
  callerUrl: string;
  targetUrl: string;
  timestamp: number;
}

export interface ThreatsPayload {
  suspiciousSells: SuspiciousSell[];
  riskEvents: RiskEvent[];
  generatedAt: number;
  chainsScanned: string[];
  blocksScanned: number;
  totalEventsSeen: number;
  /** True when no QuickNode RPC URL configured AND no Etherscan key. */
  unconfigured: boolean;
  /** Configuration hints to surface in the UI. */
  scannerStatus: {
    quicknodeConfigured: boolean;
    etherscanConfigured: boolean;
  };
}

const cache = new TtlCache<ThreatsPayload>(CACHE_TTL_MS);

/* ═══════════════════════════════════════════════════════════ */
/* Conversion: SuspiciousActivity → SuspiciousSell              */
/* ═══════════════════════════════════════════════════════════ */

function activityToSell(act: SuspiciousActivity): SuspiciousSell {
  return {
    id: act.id,
    txHash: act.txHash,
    blockNumber: act.blockNumber,
    timestamp: act.timestamp,
    chain: act.chain,
    chainId: act.chainId,
    symbol: act.tokenSymbol,
    tokenAddress: act.tokenAddress,
    tokenName: act.tokenName,
    sellerAddress: act.wallet,
    sellerLabel: act.walletLabel,
    poolAddress: act.poolAddress,
    poolLabel: act.poolDex,
    tokenAmount: act.tokenAmount,
    amountUsd: act.amountUsd,
    poolImpactPct: act.poolImpactPct,
    severity: act.severity,
    riskReasons: act.riskReasons,
    riskSummary: act.riskSummary,
    txUrl: act.txUrl,
    sellerUrl: act.walletUrl,
    poolUrl: act.poolUrl,
  };
}

/* ═══════════════════════════════════════════════════════════ */
/* Risk events (Etherscan-driven, lighter scope)                */
/* ═══════════════════════════════════════════════════════════ */

interface EtherscanTx {
  hash?: string;
  timeStamp?: string;
  from?: string;
  to?: string;
  input?: string;
}

interface EtherscanResp {
  status?: string;
  result?: EtherscanTx[] | string;
}

/* Tracked contracts for risk-event scanning. We keep this list
   small because each entry = 1 Etherscan call per refresh. The
   sell-side coverage is now whole-chain via QuickNode, so we
   only need risk events for "is the token contract owner doing
   something scary" — a different signal than DEX activity. */
const RISK_EVENT_TARGETS: Array<{
  symbol: string;
  contract: string;
  chainId: number;
  chain: string;
  explorerBase: string;
}> = [
  /* High-volume ERC-20s where sketchy admin actions matter. */
  { symbol: "USDT", contract: "0xdac17f958d2ee523a2206206994597c13d831ec7", chainId: 1, chain: "Ethereum", explorerBase: "https://etherscan.io" },
  { symbol: "USDC", contract: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", chainId: 1, chain: "Ethereum", explorerBase: "https://etherscan.io" },
  { symbol: "PEPE", contract: "0x6982508145454ce325ddbe47a25d4ec3d2311933", chainId: 1, chain: "Ethereum", explorerBase: "https://etherscan.io" },
  { symbol: "SHIB", contract: "0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce", chainId: 1, chain: "Ethereum", explorerBase: "https://etherscan.io" },
];

const RISK_LOOKBACK_MS = 6 * 60 * 60 * 1000;

async function fetchTxsForContract(
  apiKey: string,
  chainId: number,
  contract: string,
): Promise<EtherscanTx[]> {
  const url =
    `${ETHERSCAN_V2}?chainid=${chainId}` +
    `&module=account&action=txlist` +
    `&address=${contract}&page=1&offset=200&sort=desc&apikey=${apiKey}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as EtherscanResp;
    if (json.status !== "1" || !Array.isArray(json.result)) return [];
    return json.result;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function scanRiskEvents(): Promise<RiskEvent[]> {
  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) return [];

  const cutoffTs = Date.now() - RISK_LOOKBACK_MS;
  const out: RiskEvent[] = [];

  await Promise.all(
    RISK_EVENT_TARGETS.map(async (target) => {
      const txs = await fetchTxsForContract(apiKey, target.chainId, target.contract);
      for (const tx of txs) {
        const ts = parseInt(tx.timeStamp ?? "0", 10) * 1000;
        if (!Number.isFinite(ts) || ts < cutoffTs) continue;
        if (!tx.from || !tx.to || !tx.hash || !tx.input) continue;

        const risk = decodeRiskFunction(tx.input);
        if (!risk) continue;

        const callerLabel = getWalletLabel(target.chainId, tx.from.toLowerCase());
        const targetLabel = getWalletLabel(target.chainId, tx.to.toLowerCase());

        out.push({
          id: `risk-${tx.hash}-${risk.selector}`,
          txHash: tx.hash,
          chain: target.chain,
          chainId: target.chainId,
          functionName: risk.shortName,
          signature: risk.signature,
          severity: risk.severity,
          description: risk.description,
          callerAddress: tx.from.toLowerCase(),
          callerLabel: callerLabel?.label,
          targetAddress: tx.to.toLowerCase(),
          targetLabel: targetLabel?.label,
          symbol: target.symbol,
          txUrl: `${target.explorerBase}/tx/${tx.hash}`,
          callerUrl: `${target.explorerBase}/address/${tx.from.toLowerCase()}`,
          targetUrl: `${target.explorerBase}/address/${tx.to.toLowerCase()}`,
          timestamp: ts,
        });
      }
    }),
  );

  out.sort((a, b) => {
    const wDiff = severityWeight(b.severity) - severityWeight(a.severity);
    if (wDiff !== 0) return wDiff;
    return b.timestamp - a.timestamp;
  });

  return out.slice(0, 50);
}

/* ═══════════════════════════════════════════════════════════ */
/* Main entry point                                             */
/* ═══════════════════════════════════════════════════════════ */

export async function fetchThreats(): Promise<ThreatsPayload> {
  const cached = cache.get("payload");
  if (cached) return cached;

  const quicknodeConfigured = getEnabledChains().length > 0;
  const etherscanConfigured = !!process.env.ETHERSCAN_API_KEY;

  /* Run both pipelines in parallel. */
  const [scanResult, riskEvents] = await Promise.all([
    quicknodeConfigured
      ? scanForSuspiciousActivity()
      : Promise.resolve(null),
    etherscanConfigured ? scanRiskEvents() : Promise.resolve([] as RiskEvent[]),
  ]);

  const suspiciousSells: SuspiciousSell[] = scanResult
    ? scanResult.activities.map(activityToSell)
    : [];

  const payload: ThreatsPayload = {
    suspiciousSells,
    riskEvents,
    generatedAt: Date.now(),
    chainsScanned: scanResult?.chainsScanned ?? [],
    blocksScanned: scanResult?.blocksScanned ?? 0,
    totalEventsSeen: scanResult?.totalEventsSeen ?? 0,
    unconfigured: !quicknodeConfigured && !etherscanConfigured,
    scannerStatus: { quicknodeConfigured, etherscanConfigured },
  };

  if (suspiciousSells.length > 0 || riskEvents.length > 0) {
    cache.set("payload", payload);
  }
  return payload;
}
