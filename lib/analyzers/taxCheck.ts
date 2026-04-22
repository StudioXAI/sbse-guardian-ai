/* ─────────────────────────────────────────────────────────────
   DEX pair data (DexScreener).
   Kept for backward compatibility; no axios.
   ───────────────────────────────────────────────────────────── */

import { fetchJson } from "../fetchHelpers";
import { debug } from "../constants";

export async function checkDexPair(contractAddress: string) {
  try {
    const data = await fetchJson<any>(
      `https://api.dexscreener.com/latest/dex/tokens/${contractAddress}`,
      10_000,
    );
    const pairs = data?.pairs || [];
    if (!pairs.length) return { found: false, message: "No active DEX pair found" };

    const mainPair = pairs[0];
    return {
      found: true,
      dex: mainPair.dexId || "Unknown DEX",
      pairAddress: mainPair.pairAddress || "Unknown",
      liquidity: mainPair.liquidity?.usd
        ? `$${Math.round(mainPair.liquidity.usd).toLocaleString()}`
        : "Unknown",
      volume24h: mainPair.volume?.h24
        ? `$${Math.round(mainPair.volume.h24).toLocaleString()}`
        : "Unknown",
    };
  } catch (error) {
    debug("DEX pair check failed:", error);
    return { found: false, message: "DEX verification failed" };
  }
}
