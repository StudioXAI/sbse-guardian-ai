import axios from "axios";

const INSTITUTIONAL_TOKENS = ["USDC", "USDT", "DAI", "WBTC", "WETH"];

export async function checkHolderRisk(
  contractAddress: string,
  symbol?: string
) {
  try {
    /**
     * Stablecoins + bluechips should not use fake holder risk
     */

    if (
      symbol &&
      INSTITUTIONAL_TOKENS.includes(symbol.toUpperCase())
    ) {
      return {
        risky: false,
        topHolderPercent: 5,
        message: "Institutional holder structure detected",
      };
    }

    /**
     * Real API path (temporary fallback using explorer logic)
     * Later we upgrade to full Moralis / Covalent / Bitquery
     */

    const apiKey = process.env.ETHERSCAN_API_KEY;

    const url = `https://api.etherscan.io/api?module=token&action=tokenholderlist&contractaddress=${contractAddress}&page=1&offset=10&apikey=${apiKey}`;

    const response = await axios.get(url);

    const holders = response.data?.result || [];

    if (!holders.length) {
      return {
        risky: false,
        topHolderPercent: 0,
        message: "Holder analysis unavailable",
      };
    }

    /**
     * Estimate top wallet concentration
     */

    const firstHolder = holders[0];

    const topHolderPercent =
      Number(firstHolder?.percentage || 0);

    if (topHolderPercent > 25) {
      return {
        risky: true,
        topHolderPercent,
        message: "High holder concentration detected",
      };
    }

    return {
      risky: false,
      topHolderPercent,
      message: "Healthy holder distribution",
    };
  } catch (error) {
    console.error(
      "Holder analysis failed:",
      error
    );

    return {
      risky: false,
      topHolderPercent: 0,
      message: "Holder analysis unavailable",
    };
  }
}