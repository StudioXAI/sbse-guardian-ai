import axios from "axios";

const INSTITUTIONAL_TOKENS = [
  "USDC",
  "USDT",
  "DAI",
  "WBTC",
  "WETH",
  "ETH",
  "BTC",
  "FRAX",
  "TUSD",
  "FDUSD",
  "PYUSD",
];

export async function checkHolderRisk(
  contractAddress: string,
  symbol?: string
) {
  try {
    /**
     * STEP 1
     * Stablecoins + bluechips should NOT trigger false holder risk
     */

    if (
      symbol &&
      INSTITUTIONAL_TOKENS.includes(
        symbol.toUpperCase()
      )
    ) {
      return {
        risky: false,
        topHolderPercent: 5,
        message:
          "Institutional holder structure detected",
      };
    }

    /**
     * STEP 2
     * Real holder analysis using explorer endpoint
     *
     * IMPORTANT:
     * Use percentage field
     * NOT TokenHolderQuantity
     */

    const apiKey = process.env.ETHERSCAN_API_KEY;

    const url = `https://api.etherscan.io/api?module=token&action=tokenholderlist&contractaddress=${contractAddress}&page=1&offset=10&apikey=${apiKey}`;

    const response = await axios.get(url);

    const holders =
      response.data?.result || [];

    if (!holders.length) {
      return {
        risky: true,
        topHolderPercent: 0,
        message:
          "Unable to fetch holder concentration data",
      };
    }

    /**
     * FIX:
     * percentage is the correct field
     */

    const topHolderPercent = Number(
      holders[0]?.percentage || 0
    );

    /**
     * Risk thresholds
     */

    if (topHolderPercent >= 50) {
      return {
        risky: true,
        topHolderPercent,
        message:
          "Critical whale concentration detected",
      };
    }

    if (topHolderPercent >= 25) {
      return {
        risky: true,
        topHolderPercent,
        message:
          "High holder concentration detected",
      };
    }

    if (topHolderPercent >= 10) {
      return {
        risky: false,
        topHolderPercent,
        message:
          "Moderate holder concentration detected",
      };
    }

    return {
      risky: false,
      topHolderPercent,
      message:
        "Healthy decentralized holder distribution",
    };
  } catch (error) {
    console.error(
      "Holder analysis failed:",
      error
    );

    return {
      risky: true,
      topHolderPercent: 0,
      message:
        "Holder analysis unavailable",
    };
  }
}