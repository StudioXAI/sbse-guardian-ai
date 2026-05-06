/* ─────────────────────────────────────────────────────────────
   InvertX Holdings Gate — DEFERRED IMPLEMENTATION

   FUTURE FEATURE (post-Q2/Q3 2026): when InvertX launches on the
   INFI MultiChain CDEX, mainnet deploy access becomes gated by
   how much INVERTX a user holds.

   Tier structure: TBD when InvertX is closer to launch. The
   architecture stub below makes it trivial to add the gate
   logic later without touching the wizard UI extensively.

   CURRENT BEHAVIOR (v29.5):
     allowed: true, reason: null, holdings: null
     — every connected wallet can deploy on mainnet for free.

   FUTURE BEHAVIOR (post-InvertX launch):
     The check fetches INVERTX balance via balanceOf on the
     INVERTX token contract, compares against thresholds, and
     returns an InvertXGateResult that the wizard renders to
     either allow the deploy or guide the user to acquire more
     INVERTX first.

   IMPLEMENTATION NOTES (for later):
   - INVERTX contract address per chain stored in chains.ts
     (field doesn't exist yet — add when ready)
   - Use eth_call (viem.readContract) for the balanceOf — no
     transaction, no gas, no signature needed
   - Cache results client-side for ~30s to avoid spamming RPC
     while the wizard is open
   - Tier thresholds become env vars or constants in this file
   ───────────────────────────────────────────────────────────── */

import type { DeployerChain } from "./chains";

export interface InvertXGateResult {
  /** Whether the user is allowed to deploy on this chain. */
  allowed: boolean;
  /** Why they're (not) allowed. Null when no gate logic is active. */
  reason: string | null;
  /** Their INVERTX balance, formatted as a string. Null when not checked. */
  holdings: string | null;
  /** What they need to do if not allowed (URL to acquire INVERTX, etc). */
  upgradeUrl: string | null;
  /** Whether deploying on this chain currently incurs a fee. */
  feeRequired: boolean;
}

/**
 * Check whether a user is allowed to deploy on a given chain
 * based on their INVERTX holdings.
 *
 * v29.5 BEHAVIOR: always returns allowed=true. The gate is
 * deferred until InvertX launches.
 *
 * To activate the gate later:
 *   1. Add invertxContractAddress to DeployerChain interface
 *   2. Add the addresses per chain to DEPLOYER_CHAINS
 *   3. Replace the stub below with a real balanceOf check
 *   4. Decide tier thresholds (10/100, single tier, etc.)
 *   5. Update the wizard's deploy step to render the upgradeUrl
 *      hint when allowed=false
 */
export async function checkInvertXGate(
  _userAddress: string,
  _chain: DeployerChain,
  _isMainnet: boolean,
): Promise<InvertXGateResult> {
  /* TODO: implement when InvertX launches.
     For now, every deploy is allowed and free. */
  return {
    allowed: true,
    reason: null,
    holdings: null,
    upgradeUrl: null,
    feeRequired: false,
  };
}
