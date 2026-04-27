/* ─────────────────────────────────────────────────────────────
   Shared types for SbSe Guardian Alpha — Market Intelligence Layer.
   One contract between API routes and UI components.
   ───────────────────────────────────────────────────────────── */

export type Direction = "bullish" | "bearish" | "neutral";

export type SignalSource =
  | "ON-CHAIN"
  | "REGULATORY"
  | "DERIVATIVES"
  | "WHALE"
  | "SOCIAL"
  | "GITHUB"
  | "MACRO"
  | "GUARDIAN"
  | "INFI"
  | "ALPHA";

export interface Signal {
  id: string;
  source: SignalSource;
  text: string;
  direction: Direction;
  /** 0–100. Higher = stronger predicted impact. */
  score: number;
  asset?: string;
  timestamp: number;
}

export interface AssetPrediction {
  asset: string;
  direction: Direction;
  /** 0–100. */
  confidence: number;
  /** Short target description, e.g. "$64,820" or "$3,150–3,220". */
  target?: string;
  /** Optional one-line rationale. */
  reason?: string;
}

export interface PredictionResponse {
  summary: string;
  /** Short-horizon (1–2h) directional bias for tracked assets. */
  shortHorizon: AssetPrediction[];
  /** BTC across multiple timeframes. */
  btcMultiTimeframe: AssetPrediction[];
  generatedAt: number;
  cached: boolean;
}

export interface WhaleMove {
  id: string;
  address: string;
  action: string;
  amountUsd: number;
  asset: string;
  direction: Direction;
  timestamp: number;
}

export interface PolymarketBet {
  id: string;
  question: string;
  /** YES probability, 0–100. */
  yesPct: number;
  volumeUsd: number;
  /** Our directional read of this bet. */
  signalDirection: Direction;
  signalNote?: string;
  /** Direct link to the market on polymarket.com */
  link?: string;
  /** Whether the market has settled. */
  isClosed?: boolean;
}

export interface SocialPost {
  id: string;
  platform: "x" | "linkedin";
  author: string;
  authorHandle?: string;
  authorRole?: string;
  text: string;
  timestamp: number;
  engagement?: string;
  aiNote?: string;
  isAnonymous?: boolean;
  /** If set, the post card becomes a link button to this URL. */
  sourceUrl?: string;
}

export interface OverviewStats {
  signalsActive: number;
  signalsLastHour: number;
  threatsBlocked24h: number;
  walletsMonitored: number;
  whalesToday: number;
  ecosystemHealthPct: number;
  generatedAt: number;
}

export interface AlphaApiOk<T> {
  success: true;
  data: T;
}
export interface AlphaApiErr {
  success: false;
  message: string;
}
export type AlphaApiResponse<T> = AlphaApiOk<T> | AlphaApiErr;
