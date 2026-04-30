/* ─────────────────────────────────────────────────────────────
   Shared types for threat scanners

   All scanners (DEX swaps, liquidity removals, lending, large
   transfers) produce SuspiciousActivity records. The panel groups
   by category but the row shape is identical.
   ───────────────────────────────────────────────────────────── */

export type RiskReason =
  | "large_sell"
  | "liquidity_drain"
  | "abnormal_swap"
  | "high_slippage"
  | "flash_loan_pattern"
  | "suspicious_wallet"
  | "mev_bot"
  | "new_token"
  | "lp_withdrawal"
  | "lp_burn_full"
  | "treasury_outflow"
  | "exchange_deposit"
  | "exchange_withdrawal"
  | "labeled_wallet_activity"
  | "lending_borrow"
  | "liquidation"
  | "stable_swap";

export type ActivityCategory =
  | "dex_swap"
  | "liquidity_removal"
  | "lending"
  | "large_transfer";

export interface SuspiciousActivity {
  id: string;
  category: ActivityCategory;
  txHash: string;
  blockNumber: number;
  timestamp: number;
  chain: string;
  chainId: number;

  /** Primary token involved (the one being sold/transferred/etc.). */
  tokenSymbol: string;
  tokenAddress: string;
  tokenName: string;

  /** Pool/protocol contract this happened on, if applicable.
      For pure transfers this is the receiver address. */
  contractAddress: string;
  contractLabel: string;

  /** Wallet that initiated (tx sender or transfer source). */
  wallet: string;
  walletLabel?: string;

  /** Counterparty (transfer target, lending borrower, etc.). */
  counterparty?: string;
  counterpartyLabel?: string;

  /** Token amount in human units. */
  tokenAmount: number;
  /** USD value (null = unpriced). */
  amountUsd: number | null;

  /** Pool impact % (only for swap categories). 0 for transfers. */
  poolImpactPct: number;

  /** Severity score 0-100. */
  severity: number;
  /** Multi-class risk reasons. */
  riskReasons: RiskReason[];
  /** Plain-English summary. */
  riskSummary: string;

  /** Block explorer URLs. */
  txUrl: string;
  walletUrl: string;
  contractUrl: string;
}
