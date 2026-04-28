/* ─────────────────────────────────────────────────────────────
   Access Store — fully free model

   All Alpha features are available to anyone with a connected
   wallet. There are no plan tiers, no payments, no expiration.
   This file exists primarily so existing API routes and imports
   continue to compile; everything resolves to the same "open"
   state for any wallet.
   ───────────────────────────────────────────────────────────── */

export type AccessState = "none" | "open";

export interface AccessStatus {
  state: AccessState;
}

export function getAccessStatus(wallet: string): AccessStatus {
  if (!wallet) return { state: "none" };
  return { state: "open" };
}

/** Convenience: is this wallet connected? Always means access. */
export function hasAnyAccess(wallet: string): boolean {
  return Boolean(wallet);
}

/** Convenience: full feature access? Same as hasAnyAccess in the free model. */
export function hasFullAccess(wallet: string): boolean {
  return Boolean(wallet);
}
