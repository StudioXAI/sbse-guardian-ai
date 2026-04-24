/* ─────────────────────────────────────────────────────────────
   Honeypot Check (bytecode-level)
   Uses shared isInstitutional() helper — no more duplicated list.
   ───────────────────────────────────────────────────────────── */

import { ethers } from "ethers";
import { isInstitutional, debug } from "../constants";

export interface CheckResult {
  safe: boolean;
  risk: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
  message: string;
  scoreImpact: number;
}

const SUSPICIOUS_PATTERNS = [
  "blacklist",
  "setBlacklist",
  "excludeFromFee",
  "setTaxFeePercent",
  "setLiquidityFeePercent",
  "tradingEnabled",
  "setTradingEnabled",
  "maxTxAmount",
  "maxWalletAmount",
  "mint",
  "pause",
  "unpause",
];

export async function honeypotCheck(
  tokenAddress: string,
  rpcUrl: string,
  symbol?: string,
): Promise<CheckResult> {
  try {
    if (isInstitutional(symbol)) {
      return {
        safe: true,
        risk: "LOW",
        message: "Institutional token — honeypot heuristics bypassed",
        scoreImpact: 0,
      };
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, { staticNetwork: true });
    const code = await provider.getCode(tokenAddress);
    if (!code || code === "0x") {
      return { safe: false, risk: "HIGH", message: "No contract code found", scoreImpact: 4 };
    }

    const bytecode = code.toLowerCase();
    const found = SUSPICIOUS_PATTERNS.filter((p) =>
      bytecode.includes(p.toLowerCase()),
    );

    if (found.length > 0) {
      return {
        safe: false,
        risk: "MEDIUM",
        message: `Suspicious functions detected: ${found.join(", ")}`,
        scoreImpact: 2,
      };
    }

    return { safe: true, risk: "LOW", message: "No major honeypot patterns detected", scoreImpact: 0 };
  } catch (error) {
    debug("Honeypot analysis failed:", error);
    return { safe: false, risk: "UNKNOWN", message: "Failed to analyze contract", scoreImpact: 1 };
  }
}
