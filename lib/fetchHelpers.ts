/* ─────────────────────────────────────────────────────────────
   Shared HTTP + explorer helpers.
   Replaces all axios usage with native fetch + AbortController.
   ───────────────────────────────────────────────────────────── */

import { FETCH_TIMEOUT_MS } from "./constants";

export async function fetchWithTimeout(
  url: string,
  opts: RequestInit = {},
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson<T = unknown>(
  url: string,
  timeoutMs = FETCH_TIMEOUT_MS,
  opts: RequestInit = {},
): Promise<T> {
  const res = await fetchWithTimeout(url, opts, timeoutMs);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

/** Info about the detected chain, threaded through every analyzer. */
export interface ChainInfo {
  chainId: string;
  chainName: string;
  chainIdNum: number;
  rpc: string;
  explorerApi: string;
  explorerApiKey: string;
  symbol: string;
  scannerType: string;
}

/**
 * Build an explorer API URL for the CORRECT chain.
 * Automatically includes chainid for Etherscan V2 unified endpoint.
 */
export function explorerUrl(
  chain: Pick<ChainInfo, "explorerApi" | "explorerApiKey" | "chainIdNum">,
  params: Record<string, string>,
): string {
  const search = new URLSearchParams({
    chainid: String(chain.chainIdNum),
    ...params,
    apikey: chain.explorerApiKey,
  });
  return `${chain.explorerApi}?${search.toString()}`;
}

/** Safe JSON RPC call with timeout. */
export async function rpcCall<T = unknown>(
  rpc: string,
  method: string,
  params: unknown[],
  timeoutMs = 5_000,
): Promise<T> {
  const res = await fetchWithTimeout(
    rpc,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
    },
    timeoutMs,
  );
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const data = await res.json();
  if (data?.error) throw new Error(`RPC error: ${data.error.message || "unknown"}`);
  return data.result as T;
}
