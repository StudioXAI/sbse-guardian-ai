/* ─────────────────────────────────────────────────────────────
   Access Store — three public tiers + silent owner access

   Public tiers exposed to the UI:
   - "free"    — connected wallet, no paid plan; limited preview
   - "plan"    — connected wallet with active paid Trader or Pro plan
   - "expired" — paid plan that has now expired
   - "none"    — wallet not connected

   Internal-only:
   - The wallet matching PAYMENT_RECEIVER_WALLET silently maps to a
     state="plan" / plan="pro" response with a far-future expiration.
     This is intentionally indistinguishable from a real paid Pro user
     in the API and the UI. No "OWNER" labels anywhere in the bundle.
     The receiver's privileged status is never observable to other
     users — they only see Free / Trader / Pro tiers exist.
   ───────────────────────────────────────────────────────────── */

import { RECEIVER_WALLET } from "../verifyPayment";

const PLAN_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
/* Marker timestamp the receiver's "plan" expires at. Far enough out
   that a normal user would never see one. The UI shows it as a
   straight day count and won't reveal anything unusual. */
const RECEIVER_EXPIRY_MS = Date.UTC(2100, 0, 1);

export type PlanTier = "trader" | "pro";

export interface PlanPricing {
  monthlyUsd: number;
  annualUsd: number;
  features: string[];
}

export const PLANS: Record<PlanTier, PlanPricing> = {
  trader: {
    monthlyUsd: 29,
    annualUsd: 278,
    features: [
      "Real-time signal feed (live)",
      "AI predictions with multi-timeframe BTC",
      "Whale tracker — 5 exchange wallets",
      "Polymarket consensus signals",
      "DefiLlama liquidity map",
      "Coinglass liquidation heatmaps + funding rates",
      "Real-time order book depth (Binance)",
      "TradingView embedded charts",
      "INFI ecosystem tracking",
      "5 Telegram alerts per day",
    ],
  },
  pro: {
    monthlyUsd: 79,
    annualUsd: 758,
    features: [
      "Everything in Trader",
      "Custom whale wallets — track up to 25",
      "API access — 10,000 calls per day",
      "Slack & Email integrations",
      "Competitor tracking dashboard",
      "Priority support (24h response)",
      "Up to 3 team seats",
    ],
  },
};

/**
 * Limits for the public Free tier. Generous enough to demonstrate the
 * product, restrictive enough that a serious user upgrades.
 */
export const FREE_LIMITS = {
  maxSignals: 3,
  signalDelayMs: 60 * 60 * 1000, // 1 hour delay
  maxPredictionsPerDay: 1,
  showAssetCards: false,
  showWhales: false,
  showLiquidity: false,
  showPolymarket: false,
  showOrderBook: false,
  showCoinglass: false,
  showTradingView: false,
  showInfi: true,
  showSocial: true,
};

interface PlanEntry {
  tier: PlanTier;
  activatedAt: number;
  expiresAt: number;
  txHash: string;
  chainId: number;
  amountUsd: number;
}

const planStore = new Map<string, PlanEntry>();

function key(wallet: string): string {
  return wallet.toLowerCase();
}

function isReceiver(wallet: string): boolean {
  if (!RECEIVER_WALLET) return false;
  return wallet.toLowerCase() === RECEIVER_WALLET.toLowerCase();
}

/* The states exposed to the API and UI. Notice "owner" is NOT in
   this union — receivers are mapped to "plan" silently. */
export type AccessState = "none" | "free" | "expired" | "plan";

export interface AccessStatus {
  state: AccessState;
  plan?: PlanTier;
  planExpiresAt?: number;
  planActivatedAt?: number;
}

export function getAccessStatus(wallet: string): AccessStatus {
  /* Silent owner mapping — looks like a regular Pro plan to the UI. */
  if (isReceiver(wallet)) {
    return {
      state: "plan",
      plan: "pro",
      planExpiresAt: RECEIVER_EXPIRY_MS,
      planActivatedAt: Date.now() - 24 * 60 * 60 * 1000,
    };
  }

  const k = key(wallet);
  const plan = planStore.get(k);

  if (plan) {
    if (plan.expiresAt > Date.now()) {
      return {
        state: "plan",
        plan: plan.tier,
        planExpiresAt: plan.expiresAt,
        planActivatedAt: plan.activatedAt,
      };
    }
    return {
      state: "expired",
      plan: plan.tier,
      planExpiresAt: plan.expiresAt,
      planActivatedAt: plan.activatedAt,
    };
  }

  /* Connected wallet, no plan — Free tier. */
  return { state: "free" };
}

export function activatePlan(
  wallet: string,
  tier: PlanTier,
  txHash: string,
  chainId: number,
  amountUsd: number,
): PlanEntry {
  const entry: PlanEntry = {
    tier,
    activatedAt: Date.now(),
    expiresAt: Date.now() + PLAN_DURATION_MS,
    txHash,
    chainId,
    amountUsd,
  };
  planStore.set(key(wallet), entry);

  if (planStore.size > 1000) {
    const cutoff = Date.now() - PLAN_DURATION_MS;
    for (const [k, v] of planStore) {
      if (v.expiresAt < cutoff) planStore.delete(k);
    }
  }
  return entry;
}

export function getPlan(wallet: string): PlanEntry | null {
  return planStore.get(key(wallet)) ?? null;
}

/** Convenience: does this wallet have any access at all? */
export function hasAnyAccess(wallet: string): boolean {
  const s = getAccessStatus(wallet);
  return s.state === "plan" || s.state === "free";
}

/** Convenience: does this wallet have full paid access (or silent owner)? */
export function hasFullAccess(wallet: string): boolean {
  const s = getAccessStatus(wallet);
  return s.state === "plan";
}
