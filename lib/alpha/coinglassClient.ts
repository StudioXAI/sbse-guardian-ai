/* ─────────────────────────────────────────────────────────────
   Coinglass Live Data Client
   - Liquidations, Open Interest, Funding Rates across exchanges
   - Free tier requires registration: https://coinglass.com/api
   - Set COINGLASS_API_KEY in env to enable. Without it, this
     client returns null and the UI falls back to a "Configure
     to enable" card with a link to register.
   - 60-second cache (Coinglass free tier has tight rate limits)
   ───────────────────────────────────────────────────────────── */

import { TtlCache } from "./cache";

const CACHE_TTL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 10_000;
const COINGLASS_BASE = "https://open-api-v3.coinglass.com/api";

export interface LiquidationEntry {
  symbol: string;
  longLiquidationUsd24h: number;
  shortLiquidationUsd24h: number;
  totalLiquidationUsd24h: number;
}

export interface FundingRateEntry {
  symbol: string;
  exchange: string;
  fundingRate: number;
  /** Annualized rate, derived from fundingRate * 3 * 365 (8h funding cycle). */
  annualizedPct: number;
}

export interface OpenInterestEntry {
  symbol: string;
  exchange: string;
  openInterestUsd: number;
  change24hPct: number;
}

export interface CoinglassSnapshot {
  liquidations: LiquidationEntry[];
  fundingRates: FundingRateEntry[];
  openInterest: OpenInterestEntry[];
  generatedAt: number;
}

const cache = new TtlCache<CoinglassSnapshot>(CACHE_TTL_MS);

interface CGResponse<T> {
  code?: string;
  msg?: string;
  data?: T;
}

interface CGLiquidation {
  symbol?: string;
  longLiquidationUsd?: number;
  shortLiquidationUsd?: number;
  liquidationUsd?: number;
}

interface CGFundingRate {
  symbol?: string;
  exchangeName?: string;
  fundingRate?: number;
}

interface CGOpenInterest {
  symbol?: string;
  exchangeName?: string;
  openInterestAmount?: number;
  openInterestAmountChangePercent24h?: number;
}

async function cgFetch<T>(path: string, apiKey: string): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${COINGLASS_BASE}${path}`, {
      signal: controller.signal,
      headers: {
        "CG-API-KEY": apiKey,
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as CGResponse<T>;
    if (json.code !== "0" && json.code !== "00000") return null;
    return json.data ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function isCoinglassConfigured(): boolean {
  return Boolean(process.env.COINGLASS_API_KEY);
}

export async function fetchCoinglassSnapshot(): Promise<CoinglassSnapshot | null> {
  const apiKey = process.env.COINGLASS_API_KEY;
  if (!apiKey) return null;

  const cached = cache.get("snapshot");
  if (cached) return cached;

  /* Three calls in parallel — the v3 endpoints. Field names are
     conservative best-effort based on Coinglass v3 docs; if a field
     is missing we just skip the entry. */
  const [liqRaw, frRaw, oiRaw] = await Promise.all([
    cgFetch<CGLiquidation[]>("/futures/liquidation/v2/aggregated-coin-history", apiKey),
    cgFetch<CGFundingRate[]>("/futures/funding-rates", apiKey),
    cgFetch<CGOpenInterest[]>("/futures/openInterest/aggregated", apiKey),
  ]);

  const liquidations: LiquidationEntry[] = (liqRaw ?? [])
    .filter((l) => l.symbol)
    .slice(0, 8)
    .map((l) => {
      const long = l.longLiquidationUsd ?? 0;
      const short = l.shortLiquidationUsd ?? 0;
      return {
        symbol: l.symbol ?? "",
        longLiquidationUsd24h: long,
        shortLiquidationUsd24h: short,
        totalLiquidationUsd24h: l.liquidationUsd ?? long + short,
      };
    });

  const fundingRates: FundingRateEntry[] = (frRaw ?? [])
    .filter((f) => f.symbol && typeof f.fundingRate === "number")
    .slice(0, 10)
    .map((f) => {
      const rate = f.fundingRate ?? 0;
      return {
        symbol: f.symbol ?? "",
        exchange: f.exchangeName ?? "Aggregated",
        fundingRate: rate,
        /* 8h cycle * 3 per day * 365 days */
        annualizedPct: rate * 3 * 365 * 100,
      };
    });

  const openInterest: OpenInterestEntry[] = (oiRaw ?? [])
    .filter((o) => o.symbol)
    .slice(0, 8)
    .map((o) => ({
      symbol: o.symbol ?? "",
      exchange: o.exchangeName ?? "Aggregated",
      openInterestUsd: o.openInterestAmount ?? 0,
      change24hPct: o.openInterestAmountChangePercent24h ?? 0,
    }));

  const snapshot: CoinglassSnapshot = {
    liquidations,
    fundingRates,
    openInterest,
    generatedAt: Date.now(),
  };

  /* If everything came back empty, treat as unavailable. */
  if (
    liquidations.length === 0 &&
    fundingRates.length === 0 &&
    openInterest.length === 0
  ) {
    const stale = cache.getStale("snapshot");
    return stale ?? null;
  }

  cache.set("snapshot", snapshot);
  return snapshot;
}
