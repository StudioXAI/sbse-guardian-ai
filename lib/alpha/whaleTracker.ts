/* ─────────────────────────────────────────────────────────────
   Live Whale Tracker via Etherscan
   - Tracks well-known exchange / institutional wallets
   - Surfaces transactions over $1M USD
   - Uses existing ETHERSCAN_API_KEY env var
   - 90-second cache (Etherscan rate limits + sane refresh rate)
   ───────────────────────────────────────────────────────────── */

import { TtlCache } from "./cache";
import type { WhaleMove, Direction } from "./types";

const CACHE_TTL_MS = 90_000;
const ETHERSCAN_API = "https://api.etherscan.io/api";
const REQUEST_TIMEOUT_MS = 10_000;

const cache = new TtlCache<WhaleMove[]>(CACHE_TTL_MS);

/* Known exchange / institutional wallets we track for large flows.
   These are public addresses widely documented as belonging to the
   listed entity. Adding more addresses here scales the coverage. */
interface KnownWallet {
  address: string;
  label: string;
}

const TRACKED_WALLETS: KnownWallet[] = [
  { address: "0x28C6c06298d514Db089934071355E5743bf21d60", label: "Binance hot wallet" },
  { address: "0x21a31Ee1afC51d94C2eFcCAa2092aD1028285549", label: "Binance cold wallet" },
  { address: "0x71660c4005ba85c37ccec55d0c4493e66fe775d3", label: "Coinbase Prime" },
  { address: "0x2910543af39aba0cd09dbb2d50200b3e800a63d2", label: "Kraken" },
  { address: "0x77696bb39917C91A0c3908D577d5e322095425cA", label: "Bitfinex" },
];

interface EtherscanTx {
  hash?: string;
  from?: string;
  to?: string;
  value?: string;
  timeStamp?: string;
  blockNumber?: string;
}

interface EtherscanResponse {
  status?: string;
  message?: string;
  result?: EtherscanTx[];
}

function shorten(addr: string): string {
  if (addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function classifyDirection(
  tx: EtherscanTx,
  trackedAddr: string,
): { direction: Direction; action: string } {
  const isInflow = (tx.to ?? "").toLowerCase() === trackedAddr.toLowerCase();
  if (isInflow) {
    return { direction: "neutral", action: "Inflow to exchange" };
  }
  return { direction: "bullish", action: "Outflow from exchange" };
}

async function fetchTxsForWallet(
  wallet: KnownWallet,
  apiKey: string,
  ethPrice: number,
): Promise<WhaleMove[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const url =
      `${ETHERSCAN_API}?module=account&action=txlist` +
      `&address=${wallet.address}&startblock=0&endblock=99999999` +
      `&page=1&offset=20&sort=desc&apikey=${apiKey}`;

    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return [];

    const json = (await res.json()) as EtherscanResponse;
    if (json.status !== "1" || !Array.isArray(json.result)) return [];

    const moves: WhaleMove[] = [];
    for (const tx of json.result.slice(0, 10)) {
      const valueWei = BigInt(tx.value ?? "0");
      const valueEth = Number(valueWei) / 1e18;
      const valueUsd = valueEth * ethPrice;

      /* Only surface $1M+ transactions. */
      if (valueUsd < 1_000_000) continue;

      const ts = tx.timeStamp ? parseInt(tx.timeStamp, 10) * 1000 : Date.now();
      const cls = classifyDirection(tx, wallet.address);
      const counterparty = cls.direction === "bullish" ? tx.to : tx.from;

      moves.push({
        id: tx.hash ?? `${wallet.address}-${ts}`,
        address: counterparty ? shorten(counterparty) : shorten(wallet.address),
        action: `${cls.action} · ${wallet.label}`,
        amountUsd: Math.round(valueUsd),
        asset: "ETH",
        direction: cls.direction,
        timestamp: ts,
      });
    }

    return moves;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function getEthPriceUsd(): Promise<number> {
  const cgKey = process.env.COINGECKO_API_KEY;
  const url = "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd";
  const headers: Record<string, string> = { Accept: "application/json" };
  if (cgKey) headers["x-cg-demo-api-key"] = cgKey;

  try {
    const res = await fetch(url, { headers });
    if (!res.ok) return 3200;
    const json = (await res.json()) as { ethereum?: { usd?: number } };
    const price = json.ethereum?.usd;
    return typeof price === "number" && price > 0 ? price : 3200;
  } catch {
    return 3200;
  }
}

export async function fetchLiveWhaleMoves(): Promise<WhaleMove[]> {
  const cached = cache.get("all");
  if (cached) return cached;

  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) return [];

  const ethPrice = await getEthPriceUsd();

  /* Hit each tracked wallet in parallel. Etherscan free tier
     allows 5 req/sec which is fine for our small list. */
  const results = await Promise.all(
    TRACKED_WALLETS.map((w) => fetchTxsForWallet(w, apiKey, ethPrice))
  );

  const all = results
    .flat()
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 12);

  if (all.length > 0) {
    cache.set("all", all);
    return all;
  }

  /* Fall back to last good cache if available. */
  const stale = cache.getStale("all");
  return stale ?? [];
}
