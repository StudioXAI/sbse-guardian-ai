/* ─────────────────────────────────────────────────────────────
   RPC Client — multi-provider with failover

   Sends EVM JSON-RPC calls to a primary provider and falls back
   to alternates on failure. Goals:

   1. Survive QuickNode outages, rate limits, regional issues
   2. Don't exhaust paid quotas on cheap calls when a free
      provider would do
   3. Make the failover visible — diagnostic info exposes which
      provider actually served each request

   PROVIDER PRIORITY (per chain):

     Primary    — QuickNode (paid, multi-chain base URL)
     Secondary  — Ankr (free tier or paid)
     Fallback   — Public RPC (Cloudflare, drpc, llamarpc — best
                  effort, last resort, never for heavy traffic)

   ENV VARS (all optional, gracefully degrade):

     QUICKNODE_BASE_URL    — primary multi-chain endpoint
     QUICKNODE_<CHAIN>_URL — per-chain primary override (legacy)
     ANKR_BASE_URL         — secondary multi-chain endpoint
     ANKR_<CHAIN>_URL      — per-chain Ankr override
     RPC_DISABLE_PUBLIC_FALLBACK — set to "true" to never use
                                    public RPCs (cost-sensitive
                                    deployments)

   The exported API (rpcCall, rpcBatch, getBlockNumber, etc.) is
   unchanged from the QuickNode-only version. Existing scanners
   import these and get failover for free.
   ───────────────────────────────────────────────────────────── */

const REQUEST_TIMEOUT_MS = 12_000;
const PER_PROVIDER_RETRIES = 1; // 1 retry per provider before failover
const FAILOVER_BACKOFF_MS = 150; // brief pause between providers

export type SupportedChain =
  | "ethereum"
  | "bsc"
  | "polygon"
  | "arbitrum"
  | "optimism"
  | "base";

/* ═══════════════════════════════════════════════════════════ */
/* Chain configuration                                          */
/* ═══════════════════════════════════════════════════════════ */

export interface ChainConfig {
  name: string;
  chainId: number;
  /** Per-chain QuickNode env var (legacy override). */
  quicknodeEnvVar: string;
  /** QuickNode chain subdomain. Empty string = Ethereum (bare URL).
      For other chains, this gets injected before the base hostname:
      `https://NAME.quiknode.pro/SECRET/` →
      `https://NAME.SUBDOMAIN.quiknode.pro/SECRET/` */
  quicknodeSubdomain: string;
  /** Per-chain Ankr env var (legacy override). */
  ankrEnvVar: string;
  /** Ankr multi-chain path suffix (Ankr uses chain-prefixed paths). */
  ankrSuffix: string;
  /** Public-RPC default URL — last-resort fallback. */
  publicUrl: string;
  explorerBase: string;
}

export const CHAIN_CONFIG: Record<SupportedChain, ChainConfig> = {
  ethereum: {
    name: "Ethereum",
    chainId: 1,
    quicknodeEnvVar: "QUICKNODE_ETH_URL",
    quicknodeSubdomain: "",
    ankrEnvVar: "ANKR_ETH_URL",
    ankrSuffix: "eth",
    publicUrl: "https://cloudflare-eth.com",
    explorerBase: "https://etherscan.io",
  },
  bsc: {
    name: "BSC",
    chainId: 56,
    quicknodeEnvVar: "QUICKNODE_BSC_URL",
    quicknodeSubdomain: "bsc",
    ankrEnvVar: "ANKR_BSC_URL",
    ankrSuffix: "bsc",
    publicUrl: "https://bsc-dataseed.binance.org",
    explorerBase: "https://bscscan.com",
  },
  polygon: {
    name: "Polygon",
    chainId: 137,
    quicknodeEnvVar: "QUICKNODE_POLYGON_URL",
    quicknodeSubdomain: "matic",
    ankrEnvVar: "ANKR_POLYGON_URL",
    ankrSuffix: "polygon",
    publicUrl: "https://polygon-rpc.com",
    explorerBase: "https://polygonscan.com",
  },
  arbitrum: {
    name: "Arbitrum",
    chainId: 42161,
    quicknodeEnvVar: "QUICKNODE_ARBITRUM_URL",
    quicknodeSubdomain: "arbitrum-mainnet",
    ankrEnvVar: "ANKR_ARBITRUM_URL",
    ankrSuffix: "arbitrum",
    publicUrl: "https://arb1.arbitrum.io/rpc",
    explorerBase: "https://arbiscan.io",
  },
  optimism: {
    name: "Optimism",
    chainId: 10,
    quicknodeEnvVar: "QUICKNODE_OPTIMISM_URL",
    quicknodeSubdomain: "optimism",
    ankrEnvVar: "ANKR_OPTIMISM_URL",
    ankrSuffix: "optimism",
    publicUrl: "https://mainnet.optimism.io",
    explorerBase: "https://optimistic.etherscan.io",
  },
  base: {
    name: "Base",
    chainId: 8453,
    quicknodeEnvVar: "QUICKNODE_BASE_URL_CHAIN",
    quicknodeSubdomain: "base-mainnet",
    ankrEnvVar: "ANKR_BASE_URL",
    ankrSuffix: "base",
    publicUrl: "https://mainnet.base.org",
    explorerBase: "https://basescan.org",
  },
};

/* ═══════════════════════════════════════════════════════════ */
/* Provider URL resolution                                      */
/* ═══════════════════════════════════════════════════════════ */

type ProviderName = "QuickNode" | "Ankr" | "Public";

interface ProviderUrl {
  provider: ProviderName;
  url: string;
}

/**
 * Build a QuickNode multi-chain URL by injecting a subdomain
 * before the base hostname.
 *
 * QuickNode multichain pattern (per their docs):
 *   Ethereum (default): https://NAME.quiknode.pro/SECRET/
 *   Other chains:       https://NAME.SUBDOMAIN.quiknode.pro/SECRET/
 *
 * The chain identifier is in the subdomain — NOT in the path.
 * This is a critical detail: an earlier implementation appended
 * the chain as a path suffix, which silently produced URLs that
 * 404'd at the load balancer and returned empty results to the
 * scanner instead of an error.
 */
function buildQuickNodeUrl(base: string, subdomain: string): string {
  /* Empty subdomain means Ethereum / default chain — use the base URL as-is. */
  if (!subdomain) return base;

  try {
    const parsed = new URL(base);
    const hostParts = parsed.hostname.split(".");
    /* Insert the subdomain after the FIRST host segment.
       Example: "prettiest-dawn-lambo.quiknode.pro"
                → ["prettiest-dawn-lambo", "quiknode", "pro"]
       After insertion with subdomain "bsc":
                → ["prettiest-dawn-lambo", "bsc", "quiknode", "pro"]
                → "prettiest-dawn-lambo.bsc.quiknode.pro" */
    if (hostParts.length < 2) {
      /* Malformed host — fall back to bare base URL. Better than crashing. */
      return base;
    }
    const newHost = [hostParts[0], subdomain, ...hostParts.slice(1)].join(".");
    parsed.hostname = newHost;
    return parsed.toString();
  } catch {
    /* If URL parsing fails (it shouldn't), return bare base — the scanner
       will at least talk to ETH instead of erroring entirely. */
    return base;
  }
}

/**
 * Build an Ankr multi-chain URL by appending a path suffix to a base.
 * Ankr uses path-based routing: rpc.ankr.com/eth, rpc.ankr.com/bsc, etc.
 */
function buildAnkrUrl(base: string, suffix: string): string {
  const trimmed = base.endsWith("/") ? base : base + "/";
  if (!suffix) return trimmed;
  return trimmed + suffix + "/";
}

/**
 * Resolve the ordered list of provider URLs to try for a given
 * chain. Ordering: per-chain explicit override > multi-chain base
 * > skip if not configured. Public RPC is always last.
 */
function getProviderChain(chain: SupportedChain): ProviderUrl[] {
  const cfg = CHAIN_CONFIG[chain];
  const out: ProviderUrl[] = [];

  /* QuickNode primary — per-chain override beats multi-chain base. */
  const qnExplicit = process.env[cfg.quicknodeEnvVar];
  if (qnExplicit && qnExplicit.length > 0) {
    out.push({ provider: "QuickNode", url: qnExplicit });
  } else {
    const qnBase = process.env.QUICKNODE_BASE_URL;
    if (qnBase && qnBase.length > 0) {
      out.push({
        provider: "QuickNode",
        url: buildQuickNodeUrl(qnBase, cfg.quicknodeSubdomain),
      });
    }
  }

  /* Ankr secondary — uses path-suffix routing, different from QuickNode. */
  const ankrExplicit = process.env[cfg.ankrEnvVar];
  if (ankrExplicit && ankrExplicit.length > 0) {
    out.push({ provider: "Ankr", url: ankrExplicit });
  } else {
    const ankrBase = process.env.ANKR_BASE_URL;
    if (ankrBase && ankrBase.length > 0) {
      out.push({
        provider: "Ankr",
        url: buildAnkrUrl(ankrBase, cfg.ankrSuffix),
      });
    } else {
      /* No Ankr key configured — use Ankr public endpoint. They tolerate
         this for low-volume fallback use. URL pattern is stable. */
      out.push({
        provider: "Ankr",
        url: `https://rpc.ankr.com/${cfg.ankrSuffix}`,
      });
    }
  }

  /* Public RPC last-resort — only if not disabled. */
  if (process.env.RPC_DISABLE_PUBLIC_FALLBACK !== "true") {
    out.push({ provider: "Public", url: cfg.publicUrl });
  }

  return out;
}

/** Returns true if at least one provider can serve this chain. */
function chainHasProvider(chain: SupportedChain): boolean {
  return getProviderChain(chain).length > 0;
}

/** Public API: list chains with at least one usable provider. */
export function getEnabledChains(): SupportedChain[] {
  return (Object.keys(CHAIN_CONFIG) as SupportedChain[]).filter(
    chainHasProvider,
  );
}

/* ═══════════════════════════════════════════════════════════ */
/* Diagnostic tracking                                          */
/* ═══════════════════════════════════════════════════════════ */

/**
 * Per-process counter of which provider served which call. Reset
 * each time fetchThreats() runs so we get fresh stats per scan.
 * Exposed via getProviderStats() for the diagnostics panel.
 */
const providerStats = new Map<string, { successes: number; failures: number }>();

function recordProvider(provider: ProviderName, success: boolean) {
  const key = provider;
  const existing = providerStats.get(key);
  if (existing) {
    if (success) existing.successes++;
    else existing.failures++;
  } else {
    providerStats.set(key, {
      successes: success ? 1 : 0,
      failures: success ? 0 : 1,
    });
  }
}

export interface ProviderStats {
  provider: string;
  successes: number;
  failures: number;
}

export function getProviderStats(): ProviderStats[] {
  return Array.from(providerStats.entries()).map(([provider, counts]) => ({
    provider,
    successes: counts.successes,
    failures: counts.failures,
  }));
}

export function resetProviderStats(): void {
  providerStats.clear();
}

/* ═══════════════════════════════════════════════════════════ */
/* JSON-RPC types                                               */
/* ═══════════════════════════════════════════════════════════ */

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
 * Determine whether a method should AVOID public RPC fallback.
 * eth_getLogs over wide block ranges is expensive and public RPCs
 * routinely throttle or refuse it. eth_getBlockByNumber with full
 * transactions is similar. Better to fail than spam public infra.
 */
function isHeavyMethod(method: string, params: unknown[]): boolean {
  if (method === "eth_getLogs") return true;
  /* eth_getBlockByNumber with second param = true means "include
     full transactions" which can be a 1MB+ response. */
  if (method === "eth_getBlockByNumber" && params[1] === true) return true;
  return false;
}

/* ═══════════════════════════════════════════════════════════ */
/* Single RPC call with provider failover                       */
/* ═══════════════════════════════════════════════════════════ */

export async function rpcCall<T = unknown>(
  chain: SupportedChain,
  method: string,
  params: unknown[],
): Promise<T | null> {
  const providers = getProviderChain(chain);
  if (providers.length === 0) return null;

  const heavy = isHeavyMethod(method, params);
  const body: JsonRpcRequest = { method, params, id: 1 };

  for (let i = 0; i < providers.length; i++) {
    const { provider, url } = providers[i];

    /* Skip public RPC for heavy methods — public infra would throttle. */
    if (heavy && provider === "Public") continue;

    /* Try this provider with up to PER_PROVIDER_RETRIES attempts. */
    for (let attempt = 0; attempt <= PER_PROVIDER_RETRIES; attempt++) {
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
          /* Transient — retry this provider once, then failover. */
          if (res.status === 429 || res.status >= 500) {
            if (attempt < PER_PROVIDER_RETRIES) {
              await new Promise((r) => setTimeout(r, 200));
              continue;
            }
            /* Exhausted retries — record failure and try next provider. */
            recordProvider(provider, false);
            break;
          }
          /* 4xx other than 429 — auth failure, bad params, etc. Don't
             waste time retrying or trying other providers; the request
             itself is broken. */
          recordProvider(provider, false);
          return null;
        }

        const json = (await res.json()) as JsonRpcResponse<T>;
        if (json.error) {
          /* RPC-level error — don't retry. Could be unsupported method,
             rate limit, etc. Try next provider in case it handles this
             differently. */
          recordProvider(provider, false);
          break;
        }

        /* Success */
        recordProvider(provider, true);
        return json.result ?? null;
      } catch {
        /* Network error / timeout / abort — try again on this provider
           (within retry budget) or failover to next. */
        if (attempt < PER_PROVIDER_RETRIES) {
          await new Promise((r) => setTimeout(r, 200));
          continue;
        }
        recordProvider(provider, false);
      } finally {
        clearTimeout(timer);
      }
    }

    /* Brief pause before trying next provider to avoid hammering
       both at the same instant. */
    if (i < providers.length - 1) {
      await new Promise((r) => setTimeout(r, FAILOVER_BACKOFF_MS));
    }
  }

  /* All providers exhausted. */
  return null;
}

/* ═══════════════════════════════════════════════════════════ */
/* Batch RPC call with provider failover                        */
/* ═══════════════════════════════════════════════════════════ */

/**
 * Execute multiple RPC calls in a batch. Tries primary provider's
 * native batch first; if that fails or returns malformed response,
 * falls back to next provider. If all batch attempts fail, splits
 * into individual calls (some public RPCs reject batched requests).
 */
export async function rpcBatch<T = unknown>(
  chain: SupportedChain,
  requests: Array<{ method: string; params: unknown[] }>,
): Promise<Array<T | null>> {
  if (requests.length === 0) return [];
  const providers = getProviderChain(chain);
  if (providers.length === 0) return requests.map(() => null);

  /* If any request is heavy, route the batch only to providers that
     can handle heavy methods (skip public). */
  const anyHeavy = requests.some((r) => isHeavyMethod(r.method, r.params));

  /* Attempt batched send through providers in order. */
  for (let i = 0; i < providers.length; i++) {
    const { provider, url } = providers[i];
    if (anyHeavy && provider === "Public") continue;

    const batchBody = requests.map((r, idx) => ({
      jsonrpc: "2.0",
      method: r.method,
      params: r.params,
      id: idx,
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
      if (!res.ok) {
        recordProvider(provider, false);
        clearTimeout(timer);
        continue;
      }

      const json = await res.json();
      if (!Array.isArray(json)) {
        /* Provider doesn't support batching or returned malformed data.
           Fall through to next provider. */
        recordProvider(provider, false);
        clearTimeout(timer);
        continue;
      }

      const out: Array<T | null> = requests.map(() => null);
      for (const r of json as JsonRpcResponse<T>[]) {
        if (typeof r.id === "number" && r.id >= 0 && r.id < requests.length) {
          out[r.id] = r.error ? null : (r.result ?? null);
        }
      }
      recordProvider(provider, true);
      clearTimeout(timer);
      return out;
    } catch {
      recordProvider(provider, false);
      clearTimeout(timer);
    }

    if (i < providers.length - 1) {
      await new Promise((r) => setTimeout(r, FAILOVER_BACKOFF_MS));
    }
  }

  /* Last resort: send each request individually through normal failover.
     Slower (n round-trips instead of 1) but works against providers
     that reject batching. Capped at 30 to avoid runaway cost on a
     bad day. */
  const FALLBACK_LIMIT = 30;
  const subset = requests.slice(0, FALLBACK_LIMIT);
  const results = await Promise.all(
    subset.map((r) => rpcCall<T>(chain, r.method, r.params)),
  );
  /* Pad to original length so caller's index-based access doesn't break. */
  while (results.length < requests.length) results.push(null);
  return results;
}

/* ═══════════════════════════════════════════════════════════ */
/* Convenience helpers                                          */
/* ═══════════════════════════════════════════════════════════ */

export async function getBlockNumber(
  chain: SupportedChain,
): Promise<number | null> {
  const result = await rpcCall<string>(chain, "eth_blockNumber", []);
  if (typeof result !== "string") return null;
  const n = parseInt(result, 16);
  return Number.isFinite(n) ? n : null;
}

export function toHexBlock(n: number): string {
  return `0x${n.toString(16)}`;
}

/* ═══════════════════════════════════════════════════════════ */
/* Configuration introspection                                  */
/* ═══════════════════════════════════════════════════════════ */

/**
 * Return the configured provider list per chain — used by the
 * diagnostics panel so the user can see what's actually wired up.
 * Sensitive parts of URLs (the secret path) are redacted.
 */
export interface ProviderRoute {
  chain: SupportedChain;
  providers: Array<{ provider: ProviderName; redactedUrl: string }>;
}

function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    /* Show full hostname (includes chain subdomain like "bsc" or
       "matic") so the diagnostic panel can prove chain routing is
       correct. Strip only the path which contains the secret API
       key. Pathname is replaced with a placeholder to keep the
       formatting compact. */
    return `${parsed.protocol}//${parsed.host}/…`;
  } catch {
    return url.slice(0, 30) + "…";
  }
}

export function getProviderRoutes(): ProviderRoute[] {
  return (Object.keys(CHAIN_CONFIG) as SupportedChain[]).map((chain) => ({
    chain,
    providers: getProviderChain(chain).map((p) => ({
      provider: p.provider,
      redactedUrl: redactUrl(p.url),
    })),
  }));
}
