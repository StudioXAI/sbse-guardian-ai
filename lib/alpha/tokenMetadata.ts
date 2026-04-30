/* ─────────────────────────────────────────────────────────────
   Token Metadata Resolver

   Given an arbitrary ERC-20 contract address, returns its symbol,
   decimals, and name. Calls eth_call against the standard ERC-20
   methods (symbol(), decimals(), name()) and caches results for
   24 hours since these values almost never change.

   Used by the chain scanner: swap events tell us pool addresses,
   and we have to resolve the underlying token metadata to display
   anything useful to the user.

   Batched aggressively: a single HTTP round-trip resolves many
   tokens at once via QuickNode's JSON-RPC batching.
   ───────────────────────────────────────────────────────────── */

import { TtlCache } from "./cache";
import { rpcBatch, type SupportedChain } from "./quicknodeClient";

const META_TTL_MS = 24 * 60 * 60 * 1000;

export interface TokenMetadata {
  address: string;
  symbol: string;
  decimals: number;
  name: string;
}

/* Per-chain cache keyed by lowercase address. */
const cache = new Map<SupportedChain, TtlCache<TokenMetadata>>();

function cacheFor(chain: SupportedChain): TtlCache<TokenMetadata> {
  let c = cache.get(chain);
  if (!c) {
    c = new TtlCache<TokenMetadata>(META_TTL_MS);
    cache.set(chain, c);
  }
  return c;
}

/* ERC-20 method selectors (first 4 bytes of keccak256(signature)) */
const SELECTOR_SYMBOL = "0x95d89b41"; // symbol()
const SELECTOR_DECIMALS = "0x313ce567"; // decimals()
const SELECTOR_NAME = "0x06fdde03"; // name()

/**
 * Decode an ABI-encoded string return. Standard ERC-20 strings
 * look like:
 *   0x
 *   0000...0020   (offset 32)
 *   0000...000X   (length)
 *   <data padded right to 32 bytes>
 *
 * Some non-standard tokens (MKR, SAI) return bytes32 directly,
 * which is just 32 bytes of UTF-8 with right-padding.
 */
function decodeString(hex: string | null): string {
  if (!hex || typeof hex !== "string" || hex === "0x") return "";
  const stripped = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (stripped.length === 0) return "";

  /* Standard string encoding (length-prefixed) is at least 128 hex chars. */
  if (stripped.length >= 128) {
    try {
      const lenHex = stripped.slice(64, 128);
      const len = parseInt(lenHex, 16);
      if (Number.isFinite(len) && len > 0 && len <= 256) {
        const dataHex = stripped.slice(128, 128 + len * 2);
        return hexToUtf8(dataHex).replace(/\u0000/g, "").trim();
      }
    } catch {
      /* fall through to bytes32 */
    }
  }

  /* bytes32-style — just decode the whole 32 bytes, strip nulls. */
  try {
    return hexToUtf8(stripped.slice(0, 64))
      .replace(/\u0000/g, "")
      .trim();
  } catch {
    return "";
  }
}

function hexToUtf8(hex: string): string {
  let out = "";
  for (let i = 0; i + 1 < hex.length; i += 2) {
    const code = parseInt(hex.slice(i, i + 2), 16);
    if (Number.isFinite(code)) out += String.fromCharCode(code);
  }
  return out;
}

function decodeUint8(hex: string | null): number {
  if (!hex || typeof hex !== "string" || hex === "0x") return 0;
  const stripped = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (stripped.length === 0) return 0;
  const n = parseInt(stripped.slice(-2), 16);
  return Number.isFinite(n) && n >= 0 && n <= 36 ? n : 18;
}

/**
 * Resolve metadata for many addresses at once. Uses eth_call
 * batching so 30 token resolutions = 1 HTTP round-trip × 3 calls.
 *
 * Returns a Map<lowercase_address, TokenMetadata>. Addresses that
 * fail to resolve are simply absent from the map (caller should
 * handle the missing case gracefully).
 */
export async function resolveTokenMetadata(
  chain: SupportedChain,
  addresses: string[],
): Promise<Map<string, TokenMetadata>> {
  const out = new Map<string, TokenMetadata>();
  const c = cacheFor(chain);

  /* First, return anything already cached. */
  const toFetch: string[] = [];
  for (const raw of addresses) {
    const addr = raw.toLowerCase();
    if (!addr || addr.length !== 42) continue;
    const cached = c.get(addr);
    if (cached) {
      out.set(addr, cached);
    } else {
      toFetch.push(addr);
    }
  }

  if (toFetch.length === 0) return out;

  /* Build batch — for each address we call symbol, decimals, name.
     That's 3 requests per token. We cap at 50 tokens per batch
     (150 RPC calls) which QuickNode handles in a single round-trip. */
  const BATCH_SIZE = 50;
  for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
    const batch = toFetch.slice(i, i + BATCH_SIZE);
    const requests: Array<{ method: string; params: unknown[] }> = [];
    for (const addr of batch) {
      requests.push({
        method: "eth_call",
        params: [{ to: addr, data: SELECTOR_SYMBOL }, "latest"],
      });
      requests.push({
        method: "eth_call",
        params: [{ to: addr, data: SELECTOR_DECIMALS }, "latest"],
      });
      requests.push({
        method: "eth_call",
        params: [{ to: addr, data: SELECTOR_NAME }, "latest"],
      });
    }

    const results = await rpcBatch<string>(chain, requests);

    for (let j = 0; j < batch.length; j++) {
      const addr = batch[j];
      const symbol = decodeString(results[j * 3] as string | null);
      const decimals = decodeUint8(results[j * 3 + 1] as string | null);
      const name = decodeString(results[j * 3 + 2] as string | null);

      /* Skip clearly broken tokens — nothing to display. */
      if (!symbol || symbol.length === 0 || symbol.length > 20) continue;
      if (decimals === 0 && symbol === "") continue;

      const meta: TokenMetadata = { address: addr, symbol, decimals, name };
      c.set(addr, meta);
      out.set(addr, meta);
    }
  }

  return out;
}

/**
 * Convenience for single-token lookup. Slower than batching
 * but useful in one-off code paths.
 */
export async function resolveOneToken(
  chain: SupportedChain,
  address: string,
): Promise<TokenMetadata | null> {
  const map = await resolveTokenMetadata(chain, [address]);
  return map.get(address.toLowerCase()) ?? null;
}
