/* ─────────────────────────────────────────────────────────────
   Multi-Chain Whale Tracker
   - Etherscan v2 unified API (single key works across 50+ chains)
   - Tracks ERC-20 transfers on 6 major EVM chains
   - $100K USD minimum threshold
   - No source attribution exposed in returned data
   ───────────────────────────────────────────────────────────── */

import { TtlCache } from "./cache";
import type { WhaleMove, Direction } from "./types";

const CACHE_TTL_MS = 90_000;
const ETHERSCAN_V2_API = "https://api.etherscan.io/v2/api";
const REQUEST_TIMEOUT_MS = 12_000;
const MIN_USD_THRESHOLD = 100_000;

const cache = new TtlCache<WhaleMove[]>(CACHE_TTL_MS);

interface ChainConfig {
  chainId: number;
  name: string;
  wallets: Array<{ address: string; label: string }>;
  tokens: Record<string, {
    decimals: number;
    symbol: string;
    pricedAs: "USD" | "ETH" | "BTC";
  }>;
}

const CHAINS: ChainConfig[] = [
  {
    chainId: 1,
    name: "Ethereum",
    wallets: [
      { address: "0x28C6c06298d514Db089934071355E5743bf21d60", label: "Binance hot" },
      { address: "0x21a31Ee1afC51d94C2eFcCAa2092aD1028285549", label: "Binance cold" },
      { address: "0xDFd5293D8e347dFe59E90eFd55b2956a1343963d", label: "Binance 16" },
      { address: "0x71660c4005ba85c37ccec55d0c4493e66fe775d3", label: "Coinbase" },
      { address: "0xA9D1e08C7793af67e9d92fe308d5697FB81d3E43", label: "Coinbase 10" },
      { address: "0x2910543af39aba0cd09dbb2d50200b3e800a63d2", label: "Kraken" },
      { address: "0x77696bb39917C91A0c3908D577d5e322095425cA", label: "Bitfinex" },
      { address: "0x6262998Ced04146fA42253a5C0AF90CA02dfd2A3", label: "Crypto.com" },
      { address: "0xF89d7b9c864f589bbF53a82105107622B35EaA40", label: "Bybit" },
    ],
    tokens: {
      "0xdac17f958d2ee523a2206206994597c13d831ec7": { decimals: 6, symbol: "USDT", pricedAs: "USD" },
      "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": { decimals: 6, symbol: "USDC", pricedAs: "USD" },
      "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": { decimals: 18, symbol: "WETH", pricedAs: "ETH" },
      "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599": { decimals: 8, symbol: "WBTC", pricedAs: "BTC" },
    },
  },
  {
    chainId: 56,
    name: "BSC",
    wallets: [
      { address: "0x8894E0a0c962CB723c1976a4421c95949bE2D4E3", label: "Binance BSC 6" },
      { address: "0xF977814e90dA44bFA03b6295A0616a897441aceC", label: "Binance BSC 8" },
      { address: "0x3C783c21a0383057D128bae431894a5C19F9Cf06", label: "Binance BSC 7" },
    ],
    tokens: {
      "0x55d398326f99059ff775485246999027b3197955": { decimals: 18, symbol: "USDT", pricedAs: "USD" },
      "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d": { decimals: 18, symbol: "USDC", pricedAs: "USD" },
    },
  },
  {
    chainId: 137,
    name: "Polygon",
    wallets: [
      { address: "0x290275e3db66394C52272398959845170E4DCb88", label: "Binance Polygon" },
      { address: "0xe7804c37c13166fF0b37F5aE0BB07A3aEbb6e245", label: "Binance Polygon 2" },
    ],
    tokens: {
      "0xc2132d05d31c914a87c6611c10748aeb04b58e8f": { decimals: 6, symbol: "USDT", pricedAs: "USD" },
      "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359": { decimals: 6, symbol: "USDC", pricedAs: "USD" },
    },
  },
  {
    chainId: 42161,
    name: "Arbitrum",
    wallets: [
      { address: "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D", label: "Binance Arb" },
    ],
    tokens: {
      "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9": { decimals: 6, symbol: "USDT", pricedAs: "USD" },
      "0xaf88d065e77c8cc2239327c5edb3a432268e5831": { decimals: 6, symbol: "USDC", pricedAs: "USD" },
    },
  },
  {
    chainId: 10,
    name: "Optimism",
    wallets: [
      { address: "0xacD03D601e5bB1B275Bb94076fF46ED9D753435A", label: "Binance OP" },
    ],
    tokens: {
      "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58": { decimals: 6, symbol: "USDT", pricedAs: "USD" },
      "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85": { decimals: 6, symbol: "USDC", pricedAs: "USD" },
    },
  },
  {
    chainId: 8453,
    name: "Base",
    wallets: [
      { address: "0x3304E22DDaa22bCdC5fCa2269b418046aE7b566A", label: "Binance Base" },
    ],
    tokens: {
      "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": { decimals: 6, symbol: "USDC", pricedAs: "USD" },
    },
  },
];

interface PriceMap { eth: number; btc: number; }

interface EtherscanTokenTx {
  hash?: string;
  from?: string;
  to?: string;
  value?: string;
  contractAddress?: string;
  timeStamp?: string;
}
interface EtherscanResponse {
  status?: string;
  result?: EtherscanTokenTx[] | string;
}

function shorten(addr: string): string {
  if (!addr) return "—";
  if (addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

async function fetchPrices(): Promise<PriceMap> {
  const cgKey = process.env.COINGECKO_API_KEY;
  const url =
    "https://api.coingecko.com/api/v3/simple/price?ids=ethereum,bitcoin&vs_currencies=usd";
  const headers: Record<string, string> = { Accept: "application/json" };
  if (cgKey) headers["x-cg-demo-api-key"] = cgKey;
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error("price fetch");
    const json = (await res.json()) as {
      ethereum?: { usd?: number };
      bitcoin?: { usd?: number };
    };
    return {
      eth: json.ethereum?.usd ?? 3200,
      btc: json.bitcoin?.usd ?? 65000,
    };
  } catch {
    /* CoinPaprika fallback — no auth, generous limits. */
    try {
      const [btcRes, ethRes] = await Promise.all([
        fetch("https://api.coinpaprika.com/v1/tickers/btc-bitcoin"),
        fetch("https://api.coinpaprika.com/v1/tickers/eth-ethereum"),
      ]);
      const btcJ = (await btcRes.json()) as { quotes?: { USD?: { price?: number } } };
      const ethJ = (await ethRes.json()) as { quotes?: { USD?: { price?: number } } };
      return {
        eth: ethJ.quotes?.USD?.price ?? 3200,
        btc: btcJ.quotes?.USD?.price ?? 65000,
      };
    } catch {
      return { eth: 3200, btc: 65000 };
    }
  }
}

function valueInUsd(
  rawValue: string,
  contractAddr: string,
  chain: ChainConfig,
  prices: PriceMap,
): { usd: number; symbol: string } | null {
  const token = chain.tokens[contractAddr.toLowerCase()];
  if (!token) return null;
  const tokens = Number(BigInt(rawValue ?? "0")) / Math.pow(10, token.decimals);
  if (!Number.isFinite(tokens)) return null;
  const usd =
    token.pricedAs === "USD" ? tokens :
    token.pricedAs === "ETH" ? tokens * prices.eth :
    tokens * prices.btc;
  return { usd, symbol: token.symbol };
}

async function fetchChainWallet(
  chain: ChainConfig,
  wallet: { address: string; label: string },
  apiKey: string,
  prices: PriceMap,
): Promise<WhaleMove[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const url =
      `${ETHERSCAN_V2_API}?chainid=${chain.chainId}` +
      `&module=account&action=tokentx` +
      `&address=${wallet.address}` +
      `&page=1&offset=80&sort=desc` +
      `&apikey=${apiKey}`;

    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return [];

    const json = (await res.json()) as EtherscanResponse;
    if (json.status !== "1" || !Array.isArray(json.result)) return [];

    const moves: WhaleMove[] = [];

    for (const tx of json.result) {
      const valued = valueInUsd(
        tx.value ?? "0",
        (tx.contractAddress ?? "").toLowerCase(),
        chain,
        prices,
      );
      if (!valued) continue;
      if (valued.usd < MIN_USD_THRESHOLD) continue;

      const isInflow = (tx.to ?? "").toLowerCase() === wallet.address.toLowerCase();
      const direction: Direction = isInflow ? "neutral" : "bullish";
      const action = isInflow
        ? `Exchange inflow · ${chain.name}`
        : `Exchange outflow · ${chain.name}`;
      const counterparty = isInflow ? tx.from : tx.to;
      const ts = tx.timeStamp ? parseInt(tx.timeStamp, 10) * 1000 : Date.now();

      moves.push({
        id: `${chain.chainId}-${tx.hash ?? `${wallet.address}-${ts}`}`,
        address: counterparty ? shorten(counterparty) : shorten(wallet.address),
        action,
        amountUsd: Math.round(valued.usd),
        asset: valued.symbol,
        direction,
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

export async function fetchLiveWhaleMoves(): Promise<WhaleMove[]> {
  const cached = cache.get("all");
  if (cached) return cached;

  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) return [];

  const prices = await fetchPrices();

  const tasks: Promise<WhaleMove[]>[] = [];
  for (const chain of CHAINS) {
    for (const wallet of chain.wallets) {
      tasks.push(fetchChainWallet(chain, wallet, apiKey, prices));
    }
  }

  const results = await Promise.all(tasks);
  const all = results
    .flat()
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 30);

  if (all.length > 0) {
    cache.set("all", all);
    return all;
  }
  return cache.getStale("all") ?? [];
}
