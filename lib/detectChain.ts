/* ─────────────────────────────────────────────────────────────
   Universal Chain Detection Engine
   Fixes over the original:
   - Uses per-chain API keys (no more sending Etherscan key to BscScan)
   - Parallel chain scanning (was sequential → ~6x slower)
   - AbortController timeouts instead of axios defaults
   - Returns a typed ChainInfo consumed by every analyzer
   ───────────────────────────────────────────────────────────── */

import {
  CHAIN_REGISTRY,
  getExplorerApiKey,
  type ChainEntry,
} from "./chainRegistry";
import { fetchJson, rpcCall, type ChainInfo } from "./fetchHelpers";
import { RPC_TIMEOUT_MS, debug } from "./constants";

export interface DetectedChain extends ChainInfo {
  found: boolean;
}

const DEFAULT_RPC = "https://eth.llamarpc.com";

function toChainInfo(
  chain: ChainEntry,
  scannerType: string,
): ChainInfo {
  return {
    chainId: chain.id,
    chainName: chain.name,
    chainIdNum: chain.chainIdNum,
    rpc: chain.rpc || DEFAULT_RPC,
    explorerApi: chain.explorerApi,
    explorerApiKey: getExplorerApiKey(chain),
    symbol: chain.symbol,
    scannerType,
  };
}

async function probeExplorer(
  chain: ChainEntry,
  contractAddress: string,
): Promise<ChainInfo | null> {
  try {
    const apiKey = getExplorerApiKey(chain);
    if (!chain.explorerApi) return null;

    const url =
      `${chain.explorerApi}?module=contract&action=getsourcecode` +
      `&address=${contractAddress}&apikey=${apiKey}`;

    const data = await fetchJson<any>(url, 8_000);
    const result = data?.result?.[0];

    const hasContract =
      !!result &&
      (!!result.ContractName || !!result.SourceCode || !!result.ABI) &&
      result.ABI !== "Contract source code not verified" &&
      result.ABI !== "Invalid Address format";

    if (!hasContract) return null;

    return toChainInfo(chain, "Explorer API");
  } catch {
    debug("Explorer probe failed:", chain.name);
    return null;
  }
}

async function probeRpc(
  chain: ChainEntry,
  contractAddress: string,
): Promise<ChainInfo | null> {
  try {
    if (!chain.rpc) return null;
    const code = await rpcCall<string>(
      chain.rpc,
      "eth_getCode",
      [contractAddress, "latest"],
      RPC_TIMEOUT_MS,
    );
    if (!code || code === "0x" || code.length <= 10) return null;
    return toChainInfo(chain, "RPC Detection");
  } catch {
    debug("RPC probe failed:", chain.name);
    return null;
  }
}

/** Pick the first fulfilled+truthy result from a settled array. */
function firstHit<T>(results: PromiseSettledResult<T | null>[]): T | null {
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) return r.value;
  }
  return null;
}

export async function detectChain(
  contractAddress: string,
): Promise<DetectedChain> {
  /* Step 1: Parallel explorer probe. */
  const explorerResults = await Promise.allSettled(
    CHAIN_REGISTRY.map((c) => probeExplorer(c, contractAddress)),
  );
  const explorerHit = firstHit(explorerResults);
  if (explorerHit) return { ...explorerHit, found: true };

  /* Step 2: Parallel RPC fallback. */
  const rpcResults = await Promise.allSettled(
    CHAIN_REGISTRY.map((c) => probeRpc(c, contractAddress)),
  );
  const rpcHit = firstHit(rpcResults);
  if (rpcHit) return { ...rpcHit, found: true };

  /* Step 3: Not found — return Ethereum defaults so calling code
     has a valid ChainInfo shape to work with. */
  return {
    ...toChainInfo(CHAIN_REGISTRY[0], "Fallback"),
    found: false,
  };
}
