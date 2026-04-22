/* ─────────────────────────────────────────────────────────────
   Shared constants — single source of truth.
   Replaces 7 duplicated INSTITUTIONAL_TOKENS arrays scattered
   across lib/* files.
   ───────────────────────────────────────────────────────────── */

/** Major stablecoins. */
export const STABLECOINS = new Set([
  "USDC", "USDT", "DAI", "FRAX", "TUSD",
  "USDE", "FDUSD", "PYUSD", "LUSD",
]);

/** Bluechip assets (DeFi + majors). */
export const BLUECHIP_TOKENS = new Set([
  "WETH", "WBTC", "ETH", "BTC",
  "LINK", "UNI", "AAVE", "MKR",
  "ARB", "OP", "LDO",
]);

/**
 * Institutional tokens: stablecoins + bluechips.
 * These bypass risk heuristics designed for new meme/launchpad tokens.
 */
export const INSTITUTIONAL_TOKENS = new Set([
  ...STABLECOINS,
  ...BLUECHIP_TOKENS,
]);

/** EVM address validation (0x + 40 hex). */
export const CONTRACT_REGEX = /^0x[a-fA-F0-9]{40}$/;

export const FETCH_TIMEOUT_MS = 12_000;
export const RPC_TIMEOUT_MS = 5_000;

/** INFI project cache TTL (ms). */
export const INFI_CACHE_TTL_MS = 5 * 60 * 1_000;

export const isDev = process.env.NODE_ENV === "development";

export function debug(...args: unknown[]) {
  if (isDev) console.log("[sbse]", ...args);
}

export function isInstitutional(symbol?: string): boolean {
  if (!symbol) return false;
  return INSTITUTIONAL_TOKENS.has(symbol.toUpperCase());
}
