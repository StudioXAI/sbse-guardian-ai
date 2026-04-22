import { ethers } from "ethers";

const OWNABLE_ABI = [
  "function owner() view returns (address)",
];

const ZERO_ADDRESS =
  "0x0000000000000000000000000000000000000000";

const INSTITUTIONAL_TOKENS = [
  "USDC",
  "USDT",
  "DAI",
  "WETH",
  "WBTC",
  "ETH",
  "BTC",
];

export async function ownerCheck(
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
     * for having active owner permissions.
     * This is normal for regulated assets.
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
          "Institutional token detected — regulated ownership model accepted",
        owner: "Institutional Governance",
        scoreImpact: 0,
      };
    }

    /**
     * STEP 2
     * Standard owner() analysis
     */

    const provider =
      new ethers.JsonRpcProvider(rpcUrl);

    const contract = new ethers.Contract(
      tokenAddress,
      OWNABLE_ABI,
      provider
    );

    const owner = await contract.owner();

    if (!owner) {
      return {
        safe: false,
        risk: "UNKNOWN",
        message:
          "Owner could not be determined",
        scoreImpact: 1,
      };
    }

    /**
     * STEP 3
     * Ownership renounced
     */

    if (
      owner.toLowerCase() ===
      ZERO_ADDRESS.toLowerCase()
    ) {
      return {
        safe: true,
        risk: "LOW",
        message: "Ownership renounced",
        owner,
        scoreImpact: 0,
      };
    }

    /**
     * STEP 4
     * Active owner detected
     */

    return {
      safe: false,
      risk: "MEDIUM",
      message: `Active owner detected: ${owner}`,
      owner,
      scoreImpact: 2,
    };
  } catch (error) {
    console.error(
      "Ownership analysis failed:",
      error
    );

    return {
      safe: false,
      risk: "UNKNOWN",
      message:
        "Contract may not implement owner() or ownership check failed",
      scoreImpact: 1,
    };
  }
}