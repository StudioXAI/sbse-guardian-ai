/* ─────────────────────────────────────────────────────────────
   QuickNode JSON-RPC Client — multi-chain endpoint support

   Most current QuickNode endpoints are "multi-chain" — one base
   URL covers many chains, addressed via a path suffix. Examples:

   Ethereum:   https://ABC.quiknode.pro/XYZ/
   BSC:        https://ABC.quiknode.pro/XYZ/bsc/
   Polygon:    https://ABC.quiknode.pro/XYZ/polygon/
   Arbitrum:   https://ABC.quiknode.pro/XYZ/arbitrum-mainnet/
   Optimism:   https://ABC.quiknode.pro/XYZ/optimism/
   Base:       https://ABC.quiknode.pro/XYZ/base-mainnet/

   Configuration via env vars (in priority order):

     QUICKNODE_BASE_URL    — multi-chain base. Set this for the
                             modern multi-chain endpoint layout.
                             Per-chain suffix is appended automatically.

     QUICKNODE_<CHAIN>_URL — full URL for one specific chain. Wins
                             over QUICKNODE_BASE_URL if both are set.
                             Use this for legacy/standalone endpoints
                             or if you need to override one chain.

   If neither is set, the chain is disabled and the scanner skips
   it without erroring. This makes incremental rollout safe — start
   with QUICKNODE_BASE_URL for ETH, add per-chain overrides only if
   QuickNode's path-suffix conventions change for your endpoint.
   ───────────────────────────────────────────────────────────── */

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;

export type SupportedChain =
  | "ethereum"
  | "bsc"
  | "polygon"
  | "arbitrum"
  | "optimism"
  | "base";

export interface ChainConfig {
  name: string;
  chainId: number;
  /** Per-chain env var that overrides the base URL. */
  envVar: string;
  /** Path suffix appended to QUICKNODE_BASE_URL. Empty = default chain. */
  multiChainSuffix: string;
  explorerBase: string;
}

/* The multi-chain suffix list is the best-known QuickNode v3
   convention. If a chain returns 404 in production we tune just
   that suffix string here without changing any other code. */
export const CHAIN_CONFIG: Record<SupportedChain, ChainConfig> = {
  ethereum: {
    name: "Ethereum",
    chainId: 1,
    envVar: "QUICKNODE_ETH_URL",
    multiChainSuffix: "", // default — ETH uses the bare URL
    explorerBase: "https://etherscan.io",
  },
  bsc: {
    name: "BSC",
    chainId: 56,
    envVar: "QUICKNODE_BSC_URL",
    multiChainSuffix: "bsc",
    explorerBase: "https://bscscan.com",
  },
  polygon: {
    name: "Polygon",
    chainId: 137,
    envVar: "QUICKNODE_POLYGON_URL",
    multiChainSuffix: "polygon",
    explorerBase: "https://polygonscan.com",
  },
  arbitrum: {
    name: "Arbitrum",
    chainId: 42161,
    envVar: "QUICKNODE_ARBITRUM_URL",
    multiChainSuffix: "arbitrum-mainnet",
    explorerBase: "https://arbiscan.io",
  },
  optimism: {
    name: "Optimism",
    chainId: 10,
    envVar: "QUICKNODE_OPTIMISM_URL",
    multiChainSuffix: "optimism",
    explorerBase: "https://optimistic.etherscan.io",
  },
  base: {
    name: "Base",
    chainId: 8453,
    envVar: "QUICKNODE_BASE_URL",
    multiChainSuffix: "base-mainnet",
    explorerBase: "https://basescan.org",
  },
};

/**
 * Construct a multi-chain URL from base + suffix. Handles the
 * trailing-slash variations gracefully:
 *
 *   base = "https://x.quiknode.pro/abc"        → "https://x.quiknode.pro/abc/"
 *   base = "https://x.quiknode.pro/abc/"       → "https://x.quiknode.pro/abc/"
 *   suffix = ""        → base + ""             (Ethereum)
 *   suffix = "bsc"     → base + "bsc/"
 */
function buildMultiChainUrl(base: string, suffix: string): string {
  const trimmed = base.endsWith("/") ? base : base + "/";
  if (!suffix) return trimmed;
  return trimmed + suffix + "/";
}

/**
 * Returns the configured RPC URL for a chain, or null if not set.
 * Resolution order:
 *   1. Per-chain env var (legacy / single-chain endpoint)
 *   2. Multi-chain base URL + chain suffix
 *   3. null (chain disabled — scanner skips silently)
 */
export function getRpcUrl(chain: SupportedChain): string | null {
  const cfg = CHAIN_CONFIG[chain];

  /* Per-chain override wins. */
  const explicit = process.env[cfg.envVar];
  if (explicit && explicit.length > 0) return explicit;

  /* Otherwise, construct from the multi-chain base. */
  const base = process.env.QUICKNODE_BASE_URL;
  if (!base || base.length === 0) return null;
  return buildMultiChainUrl(base, cfg.multiChainSuffix);
}

/** Returns all chains that have a usable RPC endpoint. */
export function getEnabledChains(): SupportedChain[] {
  return (Object.keys(CHAIN_CONFIG) as SupportedChain[]).filter(
    (c) => getRpcUrl(c) !== null,
  );
}

interface JsonRpcRequest {
  method: string;
  params: unknown[];
  id?: number;
}

interface JsonRpcResponse<T = unknown> {
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

/**
 * Single JSON-RPC call. Retries on network errors and 5xx/429.
 * Does NOT retry on RPC-level errors (those are usually permanent
 * — bad params, unsupported method, etc.).
 */
export async function rpcCall<T = unknown>(
  chain: SupportedChain,
  method: string,
  params: unknown[],
): Promise<T | null> {
  const url = getRpcUrl(chain);
  if (!url) return null;

  const body: JsonRpcRequest = { method, params, id: 1 };

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ jsonrpc: "2.0", ...body }),
      });
      if (!res.ok) {
        if (res.status === 429 || res.status >= 500) {
          /* Transient — backoff and retry. */
          await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
          continue;
        }
        /* 4xx other than 429 — permanent for this request. Don't retry. */
        return null;
      }
      const json = (await res.json()) as JsonRpcResponse<T>;
      if (json.error) return null;
      return json.result ?? null;
    } catch {
      /* AbortError or network glitch — backoff and retry. */
      await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
    }
  }

  return null;
}

/**
 * Batch JSON-RPC call. Sends multiple requests in a single HTTP
 * round-trip. QuickNode supports JSON-RPC batching natively which
 * cuts overhead massively for token-metadata resolution where we
 * want to call symbol/decimals/name for many contracts at once.
 *
 * Returns results in the same order as requests. null entries
 * indicate per-request failures.
 */
export async function rpcBatch<T = unknown>(
  chain: SupportedChain,
  requests: Array<{ method: string; params: unknown[] }>,
): Promise<Array<T | null>> {
  const url = getRpcUrl(chain);
  if (!url) return requests.map(() => null);
  if (requests.length === 0) return [];

  const batchBody = requests.map((r, i) => ({
    jsonrpc: "2.0",
    method: r.method,
    params: r.params,
    id: i,
  }));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(batchBody),
    });
    if (!res.ok) return requests.map(() => null);

    const json = (await res.json()) as JsonRpcResponse<T>[];
    if (!Array.isArray(json)) return requests.map(() => null);

    /* QuickNode returns batch responses in arbitrary order — sort by id. */
    const out: Array<T | null> = requests.map(() => null);
    for (const r of json) {
      if (typeof r.id === "number" && r.id >= 0 && r.id < requests.length) {
        out[r.id] = r.error ? null : (r.result ?? null);
      }
    }
    return out;
  } catch {
    return requests.map(() => null);
  } finally {
    clearTimeout(timer);
  }
}

/* ═══════════════════════════════════════════════════════════ */
/* Convenience helpers                                          */
/* ═══════════════════════════════════════════════════════════ */

/** Get current block number on a chain. */
export async function getBlockNumber(chain: SupportedChain): Promise<number | null> {
  const result = await rpcCall<string>(chain, "eth_blockNumber", []);
  if (typeof result !== "string") return null;
  const n = parseInt(result, 16);
  return Number.isFinite(n) ? n : null;
}

/** Hex-encode a number for use as a block tag (eth_getLogs etc.). */
export function toHexBlock(n: number): string {
  return `0x${n.toString(16)}`;
}
