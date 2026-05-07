/* ─────────────────────────────────────────────────────────────
   encodeConstructorArgs — ABI-encode wizard params for verification

   Etherscan's verifier needs the constructor arguments in the same
   ABI-encoded form they appear at the end of the deploy transaction's
   input data. We could extract them from the deploy tx, but it's
   cleaner to encode them ourselves from the same wizard state that
   was used at deploy time.

   This module runs ON THE CLIENT side because it imports viem's
   encodeAbiParameters which is browser-safe. We export the result
   as a hex string (without 0x prefix) for the verification API.
   ───────────────────────────────────────────────────────────── */

import { encodeAbiParameters } from "viem";
import type { TokenTemplate } from "./templates";

/**
 * ABI-encode the constructor arguments for a template + params combo.
 * Returns hex without 0x prefix (the format Etherscan's verifier wants
 * in the constructorArguements field — yes, with their typo).
 */
export function encodeConstructorArgs(
  template: TokenTemplate,
  parameters: Record<string, string | number>,
): string {
  /* Build the ABI parameter list matching the constructor signature.
     Each template parameter has a solidityType (string|uint8|uint256|address)
     which maps directly to viem's ABI type. */
  const types = template.parameters.map((p) => ({
    name: p.name,
    type: p.solidityType,
  }));

  /* Build the values array, converting each from the wizard's
     loose typing to the strict types viem expects. */
  const values = template.parameters.map((p) => {
    const v = parameters[p.name];
    switch (p.solidityType) {
      case "string":
        return String(v ?? "");
      case "uint8":
        return Number(v ?? 0);
      case "uint256":
        return BigInt(v ?? 0);
      case "address":
        return v as `0x${string}`;
      default:
        return v;
    }
  });

  const encoded = encodeAbiParameters(types, values);
  /* Strip 0x prefix — Etherscan's `constructorArguements` field
     wants raw hex. */
  return encoded.startsWith("0x") ? encoded.slice(2) : encoded;
}
