/* ─────────────────────────────────────────────────────────────
   Live Market Prices via CoinGecko
   - Uses existing COINGECKO_API_KEY env var
   - Returns BTC/ETH/SOL spot prices and 24h moves
   - 60-second cache
   ───────────────────────────────────────────────────────────── */

import { TtlCache } from "./cache";

const CACHE_TTL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 8_000;

export interface MarketSnapshot {
  btc: { usd: number; change24h: number };
  eth: { usd: number; change24h: number };
  sol: { usd: number; change24h: number };
}

const cache = new TtlCache<MarketSnapshot>(CACHE_TTL_MS);

interface CGResponse {
  bitcoin?: { usd?: number; usd_24h_change?: number };
  ethereum?: { usd?: number; usd_24h_change?: number };
  solana?: { usd?: number; usd_24h_change?: number };
}

export async function fetchMarketSnapshot(): Promise<MarketSnapshot | null> {
  const cached = cache.get("snapshot");
  if (cached) return cached;

  const apiKey = process.env.COINGECKO_API_KEY;
  const url =
    "https://api.coingecko.com/api/v3/simple/price" +
    "?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (apiKey) headers["x-cg-demo-api-key"] = apiKey;

    const res = await fetch(url, { signal: controller.signal, headers });
    if (!res.ok) {
      const stale = cache.getStale("snapshot");
      return stale ?? null;
    }

    const json = (await res.json()) as CGResponse;

    const snapshot: MarketSnapshot = {
      btc: {
        usd: json.bitcoin?.usd ?? 0,
        change24h: json.bitcoin?.usd_24h_change ?? 0,
      },
      eth: {
        usd: json.ethereum?.usd ?? 0,
        change24h: json.ethereum?.usd_24h_change ?? 0,
      },
      sol: {
        usd: json.solana?.usd ?? 0,
        change24h: json.solana?.usd_24h_change ?? 0,
      },
    };

    if (snapshot.btc.usd === 0 && snapshot.eth.usd === 0) {
      const stale = cache.getStale("snapshot");
      return stale ?? null;
    }

    cache.set("snapshot", snapshot);
    return snapshot;
  } catch {
    const stale = cache.getStale("snapshot");
    return stale ?? null;
  } finally {
    clearTimeout(timer);
  }
}
