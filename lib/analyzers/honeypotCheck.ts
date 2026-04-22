import { ethers } from "ethers";

export async function honeypotCheck(
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
        message: "No contract code found",
        scoreImpact: 4,
      };
    }

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

    let foundFlags = [];

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
        message: `Suspicious functions detected: ${foundFlags.join(
          ", "
        )}`,
        scoreImpact: 2,
      };
    }

    return {
      safe: true,
      risk: "LOW",
      message: "No major honeypot patterns detected",
      scoreImpact: 0,
    };
  } catch (error) {
    return {
      safe: false,
      risk: "UNKNOWN",
      message: "Failed to analyze contract",
      scoreImpact: 1,
    };
  }
}