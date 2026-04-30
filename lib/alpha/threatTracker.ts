/* ─────────────────────────────────────────────────────────────
   Threat Tracker — orchestrator

   Runs all detection scanners in parallel and assembles a single
   grouped payload for the UI:

   - dexSwaps          — Uniswap V2/V3 + Curve + Balancer V2
   - liquidityRemovals — V2/V3 Burn events
   - lendingActivity   — Aave V3 borrows + liquidations
   - largeTransfers    — ERC20 Transfer events ≥ $50K
   - riskEvents        — dangerous function calls (Etherscan-driven)

   All scanners share types via threatTypes.ts and produce
   SuspiciousActivity records with a `category` field. The panel
   uses that to render grouped sections.

   Block-tip lookups are deduped — we fetch each chain's current
   block number once and pass it to all scanners. This saves
   ~5 RPC calls per refresh (one per scanner per chain).
   ───────────────────────────────────────────────────────────── */

import { TtlCache } from "./cache";
import {
  getEnabledChains,
  getBlockNumber,
  type SupportedChain,
} from "./quicknodeClient";
import {
  scanForSuspiciousActivity as scanUniswap,
  type ScanResult as UniswapScanResult,
} from "./dexEventScanner";
import { scanLargeTransfers } from "./transferScanner";
import { scanLiquidityRemovals } from "./liquidityRemovalScanner";
import { scanLendingActivity } from "./lendingScanner";
import { scanExtendedDex } from "./dexExtendedScanner";
import {
  decodeRiskFunction,
  severityWeight,
  type RiskSeverity,
} from "./riskFunctions";
import { getWalletLabel } from "./walletLabels";
import type { SuspiciousActivity } from "./threatTypes";

const CACHE_TTL_MS = 90_000;
const REQUEST_TIMEOUT_MS = 12_000;
const ETHERSCAN_V2 = "https://api.etherscan.io/v2/api";

/* ═══════════════════════════════════════════════════════════ */
/* Public types                                                 */
/* ═══════════════════════════════════════════════════════════ */

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

export interface ThreatGroups {
  /** Uniswap V2/V3, Curve, Balancer — all DEX swap activity */
  dexSwaps: SuspiciousActivity[];
  /** V2/V3 Burn events — liquidity withdrawn from pools */
  liquidityRemovals: SuspiciousActivity[];
  /** Aave V3 borrows + liquidations */
  lendingActivity: SuspiciousActivity[];
  /** $50K+ ERC20 Transfer events */
  largeTransfers: SuspiciousActivity[];
}

export interface ScannerDiagnostic {
  /** Scanner name. */
  name: string;
  /** Whether this scanner ran without throwing. */
  ok: boolean;
  /** Error message if it threw or returned null. Empty when ok. */
  error: string;
  /** Total raw events seen on the wire (logs returned by eth_getLogs). */
  eventsSeen: number;
  /** Activities that survived classification + thresholds. */
  flagged: number;
  /** Time the scanner took, in milliseconds. */
  durationMs: number;
}

export interface ThreatsPayload {
  groups: ThreatGroups;
  riskEvents: RiskEvent[];
  generatedAt: number;
  chainsScanned: string[];
  /** Total event counts per group — useful for the "scanned X events" line */
  scanStats: {
    dexSwapsSeen: number;
    liquidityRemovalsSeen: number;
    lendingEventsSeen: number;
    transfersSeen: number;
  };
  /** Per-scanner diagnostics — visible in the panel for debugging. */
  diagnostics: ScannerDiagnostic[];
  /** First chain's tip block — useful diagnostic. */
  tipBlocks: Array<{ chain: string; block: number }>;
  unconfigured: boolean;
  scannerStatus: {
    quicknodeConfigured: boolean;
    etherscanConfigured: boolean;
  };
}

const cache = new TtlCache<ThreatsPayload>(CACHE_TTL_MS);

/* ═══════════════════════════════════════════════════════════ */
/* Risk events (Etherscan-driven)                               */
/* Identical to the previous threatTracker — function-call decoding
   on a small list of well-known token contracts.                  */
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

const RISK_EVENT_TARGETS: Array<{
  symbol: string;
  contract: string;
  chainId: number;
  chain: string;
  explorerBase: string;
}> = [
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
/* Main entry — orchestrate all scanners                        */
/* ═══════════════════════════════════════════════════════════ */

/**
 * Look up the current block number for each enabled chain in
 * parallel. Done once and shared across all scanners — saves
 * (n_scanners - 1) × n_chains RPC calls per refresh.
 */
async function fetchTipBlocks(
  chains: SupportedChain[],
): Promise<Map<SupportedChain, number>> {
  const tips = new Map<SupportedChain, number>();
  const results = await Promise.all(
    chains.map(async (chain) => {
      const block = await getBlockNumber(chain);
      return { chain, block };
    }),
  );
  for (const { chain, block } of results) {
    if (block !== null) tips.set(chain, block);
  }
  return tips;
}

export async function fetchThreats(): Promise<ThreatsPayload> {
  const cached = cache.get("payload");
  if (cached) return cached;

  const enabledChains = getEnabledChains();
  const quicknodeConfigured = enabledChains.length > 0;
  const etherscanConfigured = !!process.env.ETHERSCAN_API_KEY;

  /* Empty defaults so the UI never crashes on missing fields. */
  const emptyGroups: ThreatGroups = {
    dexSwaps: [],
    liquidityRemovals: [],
    lendingActivity: [],
    largeTransfers: [],
  };
  const emptyStats = {
    dexSwapsSeen: 0,
    liquidityRemovalsSeen: 0,
    lendingEventsSeen: 0,
    transfersSeen: 0,
  };

  /* No QuickNode AND no Etherscan = nothing to do. */
  if (!quicknodeConfigured && !etherscanConfigured) {
    return {
      groups: emptyGroups,
      riskEvents: [],
      generatedAt: Date.now(),
      chainsScanned: [],
      scanStats: emptyStats,
      diagnostics: [],
      tipBlocks: [],
      unconfigured: true,
      scannerStatus: { quicknodeConfigured, etherscanConfigured },
    };
  }

  /* Pre-fetch block tips for all chains once. */
  const tipBlocks = quicknodeConfigured
    ? await fetchTipBlocks(enabledChains)
    : new Map<SupportedChain, number>();

  /* Build the tipBlocks list for the diagnostic payload. */
  const tipBlocksReport: Array<{ chain: string; block: number }> = [];
  for (const [chain, block] of tipBlocks.entries()) {
    tipBlocksReport.push({ chain, block });
  }

  /* Wrap each scanner with timing + error capture so failures
     are visible in the UI rather than silently producing zeros. */
  type WrappedResult<T> = {
    name: string;
    result: T | null;
    error: string;
    durationMs: number;
  };

  async function wrap<T>(
    name: string,
    promise: Promise<T>,
  ): Promise<WrappedResult<T>> {
    const start = Date.now();
    try {
      const result = await promise;
      return { name, result, error: "", durationMs: Date.now() - start };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        name,
        result: null,
        error: msg.slice(0, 200), // truncate for UI display
        durationMs: Date.now() - start,
      };
    }
  }

  /* Run all five scanners in parallel with diagnostics. */
  const [
    uniswapWrapped,
    extendedDexWrapped,
    removalWrapped,
    lendingWrapped,
    transferWrapped,
    riskEventsWrapped,
  ] = await Promise.all([
    quicknodeConfigured
      ? wrap("Uniswap V2/V3", scanUniswap())
      : Promise.resolve<WrappedResult<UniswapScanResult>>({
          name: "Uniswap V2/V3",
          result: null,
          error: "QuickNode not configured",
          durationMs: 0,
        }),
    quicknodeConfigured
      ? wrap("Curve + Balancer", scanExtendedDex(enabledChains, tipBlocks))
      : Promise.resolve<
          WrappedResult<{ activities: SuspiciousActivity[]; totalEventsSeen: number }>
        >({
          name: "Curve + Balancer",
          result: null,
          error: "QuickNode not configured",
          durationMs: 0,
        }),
    quicknodeConfigured
      ? wrap(
          "Liquidity removals",
          scanLiquidityRemovals(enabledChains, tipBlocks),
        )
      : Promise.resolve<
          WrappedResult<{ activities: SuspiciousActivity[]; totalEventsSeen: number }>
        >({
          name: "Liquidity removals",
          result: null,
          error: "QuickNode not configured",
          durationMs: 0,
        }),
    quicknodeConfigured
      ? wrap("Aave V3 lending", scanLendingActivity(enabledChains, tipBlocks))
      : Promise.resolve<
          WrappedResult<{ activities: SuspiciousActivity[]; totalEventsSeen: number }>
        >({
          name: "Aave V3 lending",
          result: null,
          error: "QuickNode not configured",
          durationMs: 0,
        }),
    quicknodeConfigured
      ? wrap("Large transfers", scanLargeTransfers(enabledChains, tipBlocks))
      : Promise.resolve<
          WrappedResult<{ activities: SuspiciousActivity[]; totalEventsSeen: number }>
        >({
          name: "Large transfers",
          result: null,
          error: "QuickNode not configured",
          durationMs: 0,
        }),
    etherscanConfigured
      ? wrap("Risk events (Etherscan)", scanRiskEvents())
      : Promise.resolve<WrappedResult<RiskEvent[]>>({
          name: "Risk events (Etherscan)",
          result: null,
          error: "Etherscan API key not set",
          durationMs: 0,
        }),
  ]);

  /* Unwrap results, defaulting to empty when null. */
  const uniswapResult = uniswapWrapped.result;
  const extendedDexResult = extendedDexWrapped.result ?? {
    activities: [],
    totalEventsSeen: 0,
  };
  const removalResult = removalWrapped.result ?? {
    activities: [],
    totalEventsSeen: 0,
  };
  const lendingResult = lendingWrapped.result ?? {
    activities: [],
    totalEventsSeen: 0,
  };
  const transferResult = transferWrapped.result ?? {
    activities: [],
    totalEventsSeen: 0,
  };
  const riskEvents = riskEventsWrapped.result ?? [];

  /* Build diagnostics list */
  const diagnostics: ScannerDiagnostic[] = [
    {
      name: uniswapWrapped.name,
      ok: uniswapWrapped.error === "" && uniswapResult !== null,
      error: uniswapWrapped.error,
      eventsSeen: uniswapResult?.totalEventsSeen ?? 0,
      flagged: uniswapResult?.activities.length ?? 0,
      durationMs: uniswapWrapped.durationMs,
    },
    {
      name: extendedDexWrapped.name,
      ok: extendedDexWrapped.error === "",
      error: extendedDexWrapped.error,
      eventsSeen: extendedDexResult.totalEventsSeen,
      flagged: extendedDexResult.activities.length,
      durationMs: extendedDexWrapped.durationMs,
    },
    {
      name: removalWrapped.name,
      ok: removalWrapped.error === "",
      error: removalWrapped.error,
      eventsSeen: removalResult.totalEventsSeen,
      flagged: removalResult.activities.length,
      durationMs: removalWrapped.durationMs,
    },
    {
      name: lendingWrapped.name,
      ok: lendingWrapped.error === "",
      error: lendingWrapped.error,
      eventsSeen: lendingResult.totalEventsSeen,
      flagged: lendingResult.activities.length,
      durationMs: lendingWrapped.durationMs,
    },
    {
      name: transferWrapped.name,
      ok: transferWrapped.error === "",
      error: transferWrapped.error,
      eventsSeen: transferResult.totalEventsSeen,
      flagged: transferResult.activities.length,
      durationMs: transferWrapped.durationMs,
    },
    {
      name: riskEventsWrapped.name,
      ok: riskEventsWrapped.error === "",
      error: riskEventsWrapped.error,
      eventsSeen: riskEventsWrapped.result?.length ?? 0,
      flagged: riskEvents.length,
      durationMs: riskEventsWrapped.durationMs,
    },
  ];

  /* Combine Uniswap + extended DEX (Curve/Balancer) into one DEX swaps
     bucket. Sort by severity, take top 8. */
  const dexSwapsCombined: SuspiciousActivity[] = [];
  if (uniswapResult) dexSwapsCombined.push(...uniswapResult.activities);
  dexSwapsCombined.push(...extendedDexResult.activities);
  dexSwapsCombined.sort((a, b) => b.severity - a.severity);

  const groups: ThreatGroups = {
    dexSwaps: dexSwapsCombined.slice(0, 8),
    liquidityRemovals: removalResult.activities,
    lendingActivity: lendingResult.activities,
    largeTransfers: transferResult.activities,
  };

  const dexEventsSeen =
    (uniswapResult?.totalEventsSeen ?? 0) + extendedDexResult.totalEventsSeen;

  const payload: ThreatsPayload = {
    groups,
    riskEvents,
    generatedAt: Date.now(),
    chainsScanned: enabledChains,
    scanStats: {
      dexSwapsSeen: dexEventsSeen,
      liquidityRemovalsSeen: removalResult.totalEventsSeen,
      lendingEventsSeen: lendingResult.totalEventsSeen,
      transfersSeen: transferResult.totalEventsSeen,
    },
    diagnostics,
    tipBlocks: tipBlocksReport,
    unconfigured: false,
    scannerStatus: { quicknodeConfigured, etherscanConfigured },
  };

  /* Cache successes only — but ALSO cache "all scanners ran cleanly
     but found nothing" so we don't hammer QuickNode every 90s on a
     legitimately quiet scan window. The check is "no errors in
     diagnostics" rather than "we found activities". */
  const allScannersClean = diagnostics.every((d) => d.ok);
  const totalActivities =
    groups.dexSwaps.length +
    groups.liquidityRemovals.length +
    groups.lendingActivity.length +
    groups.largeTransfers.length;
  if (totalActivities > 0 || riskEvents.length > 0 || allScannersClean) {
    cache.set("payload", payload);
  }
  return payload;
}
