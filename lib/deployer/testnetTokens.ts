/* ─────────────────────────────────────────────────────────────
   Testnet Tokens Helper

   Two utilities used by the deploy wizard's "Get test tokens"
   experience:

   1. fetchTestnetBalance — calls eth_getBalance against the
      testnet's public RPC for a given address. Returns balance
      in wei as a bigint, or null on error. Errors are swallowed
      silently so the UI can poll without flashing error states.

   2. copyToClipboard — copies a string to the system clipboard
      using the modern Async Clipboard API, with a fallback to
      execCommand for older Safari edge cases. Returns true on
      success.

   No new infrastructure dependencies. Pure browser-side calls
   to free public RPCs.
   ───────────────────────────────────────────────────────────── */

import type { DeployerChain } from "./chains";

/**
 * Fetch the native-token balance for an address on the testnet
 * via the chain's public RPC.
 *
 * Returns bigint balance in wei on success, null on any failure.
 * Failures are silent — the UI can poll repeatedly without showing
 * errors mid-poll, which would create a flickering UX during
 * transient network blips.
 */
export async function fetchTestnetBalance(
  chain: DeployerChain,
  address: string,
): Promise<bigint | null> {
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6_000);

  try {
    const res = await fetch(chain.testnetRpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_getBalance",
        params: [address, "latest"],
        id: 1,
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { result?: string; error?: unknown };
    if (typeof json.result !== "string" || !json.result.startsWith("0x")) {
      return null;
    }
    return BigInt(json.result);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Format wei into a short human-readable native-token amount.
 * Drops trailing zeros, caps at 6 decimal places.
 */
export function formatBalance(wei: bigint, decimals: number = 18): string {
  if (wei === BigInt(0)) return "0";
  const divisor = BigInt(10) ** BigInt(decimals);
  const whole = wei / divisor;
  const fraction = wei % divisor;
  if (fraction === BigInt(0)) return whole.toString();

  /* Build the fractional part with leading zeros, then trim
     trailing zeros, then cap to 6 chars. */
  let fracStr = fraction.toString().padStart(decimals, "0");
  fracStr = fracStr.replace(/0+$/, "").slice(0, 6);
  if (fracStr.length === 0) return whole.toString();
  return `${whole.toString()}.${fracStr}`;
}

/**
 * Copy a string to the clipboard. Returns true on success.
 *
 * Prefers the modern Async Clipboard API (available on HTTPS in
 * all modern browsers). Falls back to a temporary textarea +
 * execCommand for older Safari versions. Both paths require a
 * user-initiated event (button click), which is how this is used.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  /* Modern API */
  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === "function"
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* Fall through to legacy fallback */
    }
  }

  /* Legacy fallback */
  if (typeof document === "undefined") return false;
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
