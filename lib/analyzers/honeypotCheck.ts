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

export async function honeypotCheck(
  tokenAddress: string,
  rpcUrl: string,
  symbol?: string
) {
  try {
    /**
     * STEP 1
     * Institutional token override
     *
     * Stablecoins + bluechips should NOT be flagged
     * for normal admin functions like mint/pause/owner
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
          "Institutional token detected — honeypot risk bypassed",
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
        message: "No contract code found",
        scoreImpact: 4,
      };
    }

    /**
     * STEP 3
     * Suspicious honeypot patterns
     */

    const suspiciousPatterns = [
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

    if (foundFlags.length > 0) {
      return {
        safe: false,
        risk: "MEDIUM",
        message: `Suspicious functions detected: ${foundFlags.join(
          ", "
        )}`,
        scoreImpact: 2,
      };
    }

    /**
     * STEP 4
     * Safe result
     */

    return {
      safe: true,
      risk: "LOW",
      message:
        "No major honeypot patterns detected",
      scoreImpact: 0,
    };
  } catch (error) {
    console.error(
      "Honeypot analysis failed:",
      error
    );

    return {
      safe: false,
      risk: "UNKNOWN",
      message: "Failed to analyze contract",
      scoreImpact: 1,
    };
  }
}