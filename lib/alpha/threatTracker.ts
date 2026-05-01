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
  getProviderStats,
  resetProviderStats,
  getProviderRoutes,
  type SupportedChain,
  type ProviderStats,
  type ProviderRoute,
} from "./quicknodeClient";
import {
  scanForSuspiciousActivity as scanUniswap,
  type ScanResult as UniswapScanResult,
} from "./dexEventScanner";
import { scanLargeTransfers } from "./transferScanner";
import { scanLiquidityRemovals } from "./liquidityRemovalScanner";
import { scanLendingActivity } from "./lendingScanner";
import { scanExtendedDex } from "./dexExtendedScanner";
import { scanAdminEvents, type AdminRiskEvent } from "./adminEventScanner";
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
  /** Which RPC providers actually answered our calls in this scan.
      Surfaces silent QuickNode failures by showing fallback usage. */
  providerStats: ProviderStats[];
  /** Configured provider chain per supported chain — diagnostic. */
  providerRoutes: ProviderRoute[];
  /** Recent warnings buffered in this serverless instance's memory.
      NOT a real 24h history — only persists while this instance is
      warm. The UI labels this honestly. */
  recent: {
    groups: ThreatGroups;
    /** First-seen timestamp of the OLDEST entry in the buffer.
        Tells the user how far back the buffered window actually
        reaches, instead of claiming a fixed 24h that we can't keep.
        null when buffer is empty. */
    oldestEntryAt: number | null;
    /** Total entries in the buffer (may exceed displayed counts). */
    bufferSize: number;
  };
  unconfigured: boolean;
  scannerStatus: {
    quicknodeConfigured: boolean;
    etherscanConfigured: boolean;
  };
}

const cache = new TtlCache<ThreatsPayload>(CACHE_TTL_MS);

/* ═══════════════════════════════════════════════════════════ */
/* In-memory rolling buffer of recent warnings                  */
/*                                                              */
/* Keeps activities seen across recent scans alongside the      */
/* "live now" results. NOT a real 24h history — Vercel          */
/* serverless instances are ephemeral, so the buffer only       */
/* persists for as long as this specific instance stays warm.   */
/* The UI labels this honestly as "Recent warnings (session)"   */
/* rather than claiming a 24-hour window we can't deliver.      */
/*                                                              */
/* Constraints:                                                 */
/*   - Max 500 entries (caps RAM at ~500KB)                     */
/*   - Dedupe by activity.id                                    */
/*   - 24h max age (older entries evicted on each scan)         */
/*   - Per-process — each warm instance has its own buffer      */
/* ═══════════════════════════════════════════════════════════ */

const BUFFER_MAX_ENTRIES = 500;
const BUFFER_MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface BufferEntry {
  activity: SuspiciousActivity;
  /** When this activity first entered the buffer (epoch ms). */
  firstSeenAt: number;
}

/* Single buffer keyed by activity.id. Same activity appearing
   in two consecutive scans (due to overlapping block windows)
   only counts once and keeps its original firstSeenAt. */
const recentBuffer = new Map<string, BufferEntry>();

/**
 * Merge a fresh batch of activities into the buffer. Drops
 * anything older than BUFFER_MAX_AGE_MS, then trims to the
 * BUFFER_MAX_ENTRIES cap by keeping the most-recent-first.
 */
function mergeIntoBuffer(activities: SuspiciousActivity[]): void {
  const now = Date.now();

  /* Add or refresh entries from this scan. */
  for (const a of activities) {
    if (!recentBuffer.has(a.id)) {
      recentBuffer.set(a.id, { activity: a, firstSeenAt: now });
    }
    /* If the entry already exists, leave firstSeenAt unchanged —
       we want to remember when we FIRST saw it, not the last. */
  }

  /* Evict entries older than the max age. */
  for (const [id, entry] of recentBuffer.entries()) {
    if (now - entry.firstSeenAt > BUFFER_MAX_AGE_MS) {
      recentBuffer.delete(id);
    }
  }

  /* Cap total size — drop oldest entries beyond the limit. */
  if (recentBuffer.size > BUFFER_MAX_ENTRIES) {
    const sortedByAge = [...recentBuffer.entries()].sort(
      (a, b) => a[1].firstSeenAt - b[1].firstSeenAt,
    );
    const toRemove = recentBuffer.size - BUFFER_MAX_ENTRIES;
    for (let i = 0; i < toRemove; i++) {
      recentBuffer.delete(sortedByAge[i][0]);
    }
  }
}

/**
 * Read the buffer and return entries grouped by category, sorted
 * within each group by firstSeenAt desc (most recent first).
 */
function readBuffer(): {
  groups: ThreatGroups;
  bufferedAt: number | null;
  bufferSize: number;
} {
  const entries = [...recentBuffer.values()];
  if (entries.length === 0) {
    return {
      groups: {
        dexSwaps: [],
        liquidityRemovals: [],
        lendingActivity: [],
        largeTransfers: [],
      },
      bufferedAt: null,
      bufferSize: 0,
    };
  }

  /* Sort by first-seen desc — newest first across the whole buffer. */
  entries.sort((a, b) => b.firstSeenAt - a.firstSeenAt);

  /* Group by category. */
  const groups: ThreatGroups = {
    dexSwaps: [],
    liquidityRemovals: [],
    lendingActivity: [],
    largeTransfers: [],
  };
  for (const e of entries) {
    const cat = e.activity.category;
    if (cat === "dex_swap") groups.dexSwaps.push(e.activity);
    else if (cat === "liquidity_removal") groups.liquidityRemovals.push(e.activity);
    else if (cat === "lending") groups.lendingActivity.push(e.activity);
    else if (cat === "large_transfer") groups.largeTransfers.push(e.activity);
  }

  /* Cap each category at 24 entries for display — beyond that the UI
     gets unwieldy and most users only care about the recent stuff. */
  groups.dexSwaps = groups.dexSwaps.slice(0, 24);
  groups.liquidityRemovals = groups.liquidityRemovals.slice(0, 24);
  groups.lendingActivity = groups.lendingActivity.slice(0, 24);
  groups.largeTransfers = groups.largeTransfers.slice(0, 24);

  /* Find the OLDEST firstSeenAt — that's how far back the buffer goes.
     This is what we honestly tell the user instead of claiming "24h". */
  const oldest = entries.reduce(
    (min, e) => (e.firstSeenAt < min ? e.firstSeenAt : min),
    entries[0].firstSeenAt,
  );

  return {
    groups,
    bufferedAt: oldest,
    bufferSize: entries.length,
  };
}

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

  /* Reset provider stats — we want fresh per-scan attribution. */
  resetProviderStats();

  const enabledChains = getEnabledChains();
  const quicknodeConfigured = enabledChains.length > 0;
  const etherscanConfigured = !!process.env.ETHERSCAN_API_KEY;
  const providerRoutes = getProviderRoutes();

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
      providerStats: [],
      providerRoutes,
      recent: {
        groups: emptyGroups,
        oldestEntryAt: null,
        bufferSize: 0,
      },
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
    adminEventsWrapped,
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
    /* Risk events: chain-wide admin event scan (primary) plus
       optional Etherscan function-call scan as a supplementary
       source for the curated contract list. The chain-wide scan
       requires QuickNode (uses eth_getLogs); the function-call
       scan requires Etherscan. Both feed into the same RiskEvent
       output. */
    quicknodeConfigured
      ? wrap(
          "Risk events (admin events)",
          scanAdminEvents(enabledChains, tipBlocks),
        )
      : Promise.resolve<
          WrappedResult<{ events: AdminRiskEvent[]; totalEventsSeen: number }>
        >({
          name: "Risk events (admin events)",
          result: null,
          error: "QuickNode not configured",
          durationMs: 0,
        }),
    etherscanConfigured
      ? wrap("Risk events (Etherscan calls)", scanRiskEvents())
      : Promise.resolve<WrappedResult<RiskEvent[]>>({
          name: "Risk events (Etherscan calls)",
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
  /* Admin events: chain-wide standardized event scan (the strong source). */
  const adminEventsResult = adminEventsWrapped.result ?? {
    events: [],
    totalEventsSeen: 0,
  };
  /* Etherscan function-call scan: legacy supplementary source. May be empty
     if the API key isn't configured or if the curated contracts haven't
     emitted any risky calls recently. */
  const etherscanRiskEvents = riskEventsWrapped.result ?? [];

  /* Convert admin events to the RiskEvent shape. AdminRiskEvent is
     structurally identical so this is a no-op cast at runtime, but
     TypeScript needs the explicit map for type compatibility. */
  const adminAsRiskEvents: RiskEvent[] = adminEventsResult.events.map((e) => ({
    id: e.id,
    txHash: e.txHash,
    chain: e.chain,
    chainId: e.chainId,
    functionName: e.functionName,
    signature: e.signature,
    severity: e.severity,
    description: e.description,
    callerAddress: e.callerAddress,
    callerLabel: e.callerLabel,
    targetAddress: e.targetAddress,
    targetLabel: e.targetLabel,
    symbol: e.symbol,
    txUrl: e.txUrl,
    callerUrl: e.callerUrl,
    targetUrl: e.targetUrl,
    timestamp: e.timestamp,
  }));

  /* Combine both sources, dedupe by tx hash + function name (in
     case Etherscan and the admin event scan both catch the same
     event). Sort already happens inside each source's scanner;
     final unified sort is by severity weight then timestamp. */
  const combined = new Map<string, RiskEvent>();
  for (const e of adminAsRiskEvents) {
    const key = `${e.txHash}-${e.functionName}`;
    combined.set(key, e);
  }
  for (const e of etherscanRiskEvents) {
    const key = `${e.txHash}-${e.functionName}`;
    if (!combined.has(key)) combined.set(key, e);
  }
  const sevWeightFinal: Record<string, number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
  };
  const riskEvents = [...combined.values()]
    .sort((a, b) => {
      const w = (sevWeightFinal[b.severity] ?? 0) - (sevWeightFinal[a.severity] ?? 0);
      if (w !== 0) return w;
      return b.timestamp - a.timestamp;
    })
    .slice(0, 50);

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
      name: adminEventsWrapped.name,
      ok: adminEventsWrapped.error === "",
      error: adminEventsWrapped.error,
      eventsSeen: adminEventsResult.totalEventsSeen,
      flagged: adminEventsResult.events.length,
      durationMs: adminEventsWrapped.durationMs,
    },
    {
      name: riskEventsWrapped.name,
      ok: riskEventsWrapped.error === "",
      error: riskEventsWrapped.error,
      eventsSeen: riskEventsWrapped.result?.length ?? 0,
      flagged: etherscanRiskEvents.length,
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

  /* Merge ALL flagged activities (not just the top-N displayed) into
     the rolling buffer. We use the full result sets so that scrolling
     back through the "Recent" tab shows every individual warning that
     surfaced during the session, not just whatever was top-8 each scan. */
  const allFlagged: SuspiciousActivity[] = [
    ...dexSwapsCombined, // full combined Uniswap+extended set, not the top-8 slice
    ...removalResult.activities,
    ...lendingResult.activities,
    ...transferResult.activities,
  ];
  mergeIntoBuffer(allFlagged);
  const bufferSnapshot = readBuffer();

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
    /* Snapshot per-provider attribution AFTER all scanners have run. */
    providerStats: getProviderStats(),
    providerRoutes,
    recent: {
      groups: bufferSnapshot.groups,
      oldestEntryAt: bufferSnapshot.bufferedAt,
      bufferSize: bufferSnapshot.bufferSize,
    },
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
