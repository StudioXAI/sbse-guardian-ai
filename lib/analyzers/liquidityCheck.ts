import { ethers } from "ethers";

export async function liquidityCheck(
  tokenAddress: string,
  rpcUrl: string
) {
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    const code = await provider.getCode(tokenAddress);

    if (!code || code === "0x") {
      return {
        safe: false,
        risk: "HIGH",
        message: "Token contract not found",
        scoreImpact: 4,
      };
    }

    /*
      Basic first-layer liquidity risk detection.

      Later we will upgrade this to:
      - LP lock verification
      - pair reserve analysis
      - liquidity unlock schedule
      - real-time DEX pool validation
    */

    const suspiciousPatterns = [
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

    let foundFlags: string[] = [];

    for (const pattern of suspiciousPatterns) {
      if (
        code.toLowerCase().includes(
          pattern.toLowerCase()
        )
      ) {
        foundFlags.push(pattern);
      }
    }

    if (foundFlags.length > 0) {
      return {
        safe: false,
        risk: "MEDIUM",
        message: `Liquidity control functions detected: ${foundFlags.join(
          ", "
        )}`,
        scoreImpact: 2,
      };
    }

    return {
      safe: true,
      risk: "LOW",
      message:
        "No obvious liquidity drain functions detected",
      scoreImpact: 0,
    };
  } catch (error) {
    return {
      safe: false,
      risk: "UNKNOWN",
      message: "Liquidity analysis failed",
      scoreImpact: 1,
    };
  }
}