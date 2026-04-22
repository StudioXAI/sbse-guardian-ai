/* ─────────────────────────────────────────────────────────────
   Liquidity Check (bytecode-level)
   ───────────────────────────────────────────────────────────── */

import { ethers } from "ethers";
import { isInstitutional, debug } from "../constants";
import type { CheckResult } from "./honeypotCheck";

const SUSPICIOUS_PATTERNS = [
  "removeLiquidity",
  "withdrawLiquidity",
  "emergencyWithdraw",
  "rescueTokens",
  "sweepFunds",
  "drain",
  "withdrawETH",
  "withdrawBNB",
  "withdrawUSDT",
];

export async function liquidityCheck(
  tokenAddress: string,
  rpcUrl: string,
  symbol?: string,
): Promise<CheckResult> {
  try {
    if (isInstitutional(symbol)) {
      return {
        safe: true,
        risk: "LOW",
        message: "Institutional token — managed liquidity architecture accepted",
        scoreImpact: 0,
      };
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const code = await provider.getCode(tokenAddress);
    if (!code || code === "0x") {
      return { safe: false, risk: "HIGH", message: "Token contract not found", scoreImpact: 4 };
    }

    const bytecode = code.toLowerCase();
    const found = SUSPICIOUS_PATTERNS.filter((p) =>
      bytecode.includes(p.toLowerCase()),
    );

    if (found.length > 0) {
      return {
        safe: false,
        risk: "MEDIUM",
        message: `Liquidity control functions detected: ${found.join(", ")}`,
        scoreImpact: 2,
      };
    }

    return {
      safe: true,
      risk: "LOW",
      message: "No obvious liquidity drain functions detected",
      scoreImpact: 0,
    };
  } catch (error) {
    debug("Liquidity analysis failed:", error);
    return { safe: false, risk: "UNKNOWN", message: "Liquidity analysis failed", scoreImpact: 1 };
  }
}
