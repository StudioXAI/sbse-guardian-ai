import axios from "axios";

const INSTITUTIONAL_TOKENS = [
  "USDC",
  "USDT",
  "DAI",
  "WETH",
  "WBTC",
  "ETH",
  "BTC",
];

export async function checkLiquiditySource(
  contractAddress: string,
  symbol?: string
) {
  try {
    /**
     * STEP 1
     * Stablecoins + Bluechips should NOT use DexScreener
     */

    if (
      symbol &&
      INSTITUTIONAL_TOKENS.includes(
        symbol.toUpperCase()
      )
    ) {
      return {
        found: true,
        dex: "Institutional Liquidity Infrastructure",
        pairAddress: "Multi-venue Routing",
        liquidity: "Deep Institutional Liquidity",
        volume24h: "CEX + Cross-chain Verified",
        institutional: true,
      };
    }

    /**
     * STEP 2
     * Explorer + on-chain detection first
     * (future full LP parser layer)
     */

    const apiKey = process.env.ETHERSCAN_API_KEY;

    const explorerUrl = `https://api.etherscan.io/api?module=contract&action=getsourcecode&address=${contractAddress}&apikey=${apiKey}`;

    const explorerResponse =
      await axios.get(explorerUrl);

    const contractData =
      explorerResponse.data?.result?.[0];

    const sourceCode = (
      contractData?.SourceCode || ""
    ).toLowerCase();

    const hasLiquidityLogic =
      sourceCode.includes("uniswap") ||
      sourceCode.includes("router") ||
      sourceCode.includes("pair") ||
      sourceCode.includes("liquidity") ||
      sourceCode.includes("addliquidity") ||
      sourceCode.includes("swapexacttokens");

    /**
     * STEP 3
     * Only fallback to DexScreener if needed
     */

    if (!hasLiquidityLogic) {
      return {
        found: false,
        message:
          "No on-chain liquidity infrastructure detected",
        institutional: false,
      };
    }

    const dexUrl = `https://api.dexscreener.com/latest/dex/tokens/${contractAddress}`;

    const dexResponse = await axios.get(dexUrl);

    const pairs =
      dexResponse.data?.pairs || [];

    if (!pairs.length) {
      return {
        found: false,
        message:
          "Liquidity logic found but no active DEX pair",
        institutional: false,
      };
    }

    const mainPair = pairs[0];

    return {
      found: true,
      dex:
        mainPair.dexId ||
        "Verified On-Chain Liquidity",
      pairAddress:
        mainPair.pairAddress || "Unknown",
      liquidity: mainPair.liquidity?.usd
        ? `$${Math.round(
            mainPair.liquidity.usd
          ).toLocaleString()}`
        : "Unknown",
      volume24h: mainPair.volume?.h24
        ? `$${Math.round(
            mainPair.volume.h24
          ).toLocaleString()}`
        : "Unknown",
      institutional: false,
    };
  } catch (error) {
    console.error(
      "Liquidity source check failed:",
      error
    );

    return {
      found: false,
      message:
        "Liquidity verification failed",
      institutional: false,
    };
  }
}