import { ethers } from "ethers";

const INSTITUTIONAL_TOKENS = [
  "USDC",
  "USDT",
  "DAI",
  "WETH",
  "WBTC",
  "ETH",
  "BTC",
];

export async function liquidityCheck(
  tokenAddress: string,
  rpcUrl: string,
  symbol?: string
) {
  try {
    /**
     * STEP 1
     * Institutional token override
     *
     * Stablecoins + bluechips should NOT be penalized
     * for treasury / liquidity control functions.
     */

    if (
      symbol &&
      INSTITUTIONAL_TOKENS.includes(
        symbol.toUpperCase()
      )
    ) {
      return {
        safe: true,
        risk: "LOW",
        message:
          "Institutional token detected — managed liquidity architecture accepted",
        scoreImpact: 0,
      };
    }

    /**
     * STEP 2
     * Standard smart contract scan
     */

    const provider =
      new ethers.JsonRpcProvider(rpcUrl);

    const code =
      await provider.getCode(tokenAddress);

    if (!code || code === "0x") {
      return {
        safe: false,
        risk: "HIGH",
        message: "Token contract not found",
        scoreImpact: 4,
      };
    }

    /**
     * STEP 3
     * Basic liquidity risk detection
     *
     * Future upgrades:
     * - LP lock verification
     * - pair reserve analysis
     * - liquidity unlock schedule
     * - real-time DEX pool validation
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

    const bytecode = code.toLowerCase();

    let foundFlags: string[] = [];

    for (const pattern of suspiciousPatterns) {
      if (
        bytecode.includes(
          pattern.toLowerCase()
        )
      ) {
        foundFlags.push(pattern);
      }
    }

    /**
     * STEP 4
     * Suspicious liquidity controls found
     */

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

    /**
     * STEP 5
     * Safe result
     */

    return {
      safe: true,
      risk: "LOW",
      message:
        "No obvious liquidity drain functions detected",
      scoreImpact: 0,
    };
  } catch (error) {
    console.error(
      "Liquidity analysis failed:",
      error
    );

    return {
      safe: false,
      risk: "UNKNOWN",
      message: "Liquidity analysis failed",
      scoreImpact: 1,
    };
  }
}