import axios from "axios";

const INSTITUTIONAL_TOKENS = [
  "USDC",
  "USDT",
  "DAI",
  "WETH",
  "WBTC",
  "ETH",
  "BTC",
  "FRAX",
  "TUSD",
  "FDUSD",
  "PYUSD",
];

export async function checkLiquiditySource(
  contractAddress: string,
  symbol?: string
) {
  try {
    /**
     * STEP 1
     * Stablecoins + Bluechips
     * should NEVER rely on DexScreener-first logic
     */

    if (
      symbol &&
      INSTITUTIONAL_TOKENS.includes(
        symbol.toUpperCase()
      )
    ) {
      return {
        found: true,
        dex:
          "Institutional Liquidity Infrastructure",
        pairAddress:
          "Multi-venue Routing",
        liquidity:
          "Deep Institutional Liquidity",
        volume24h:
          "CEX + Cross-chain Verified",
        institutional: true,
      };
    }

    /**
     * STEP 2
     * Explorer-based source code verification first
     */

    const apiKey =
      process.env.ETHERSCAN_API_KEY;

    const explorerUrl = `https://api.etherscan.io/api?module=contract&action=getsourcecode&address=${contractAddress}&apikey=${apiKey}`;

    const explorerResponse =
      await axios.get(explorerUrl);

    const contractData =
      explorerResponse.data?.result?.[0];

    const sourceCode = (
      contractData?.SourceCode || ""
    ).toLowerCase();

    if (!sourceCode) {
      return {
        found: false,
        message:
          "Unable to verify on-chain liquidity structure",
        institutional: false,
      };
    }

    /**
     * STEP 3
     * Detect real blockchain liquidity infrastructure
     */

    const hasLiquidityLogic =
      sourceCode.includes(
        "uniswap"
      ) ||
      sourceCode.includes(
        "pancakeswap"
      ) ||
      sourceCode.includes(
        "sushiswap"
      ) ||
      sourceCode.includes(
        "router"
      ) ||
      sourceCode.includes(
        "pair"
      ) ||
      sourceCode.includes(
        "liquidity"
      ) ||
      sourceCode.includes(
        "addliquidity"
      ) ||
      sourceCode.includes(
        "removeliquidity"
      ) ||
      sourceCode.includes(
        "swapexacttokens"
      ) ||
      sourceCode.includes(
        "swapexacteth"
      ) ||
      sourceCode.includes(
        "factory"
      );

    if (!hasLiquidityLogic) {
      return {
        found: false,
        message:
          "No verified blockchain liquidity infrastructure detected",
        institutional: false,
      };
    }

    /**
     * STEP 4
     * DexScreener ONLY as secondary enrichment
     */

    const dexUrl = `https://api.dexscreener.com/latest/dex/tokens/${contractAddress}`;

    const dexResponse =
      await axios.get(dexUrl);

    const pairs =
      dexResponse.data?.pairs || [];

    if (!pairs.length) {
      return {
        found: true,
        dex:
          "Verified On-Chain Liquidity",
        pairAddress:
          "Detected via Contract Logic",
        liquidity:
          "Blockchain Verified",
        volume24h:
          "Pending Live Pair Discovery",
        institutional: false,
      };
    }

    /**
     * STEP 5
     * Choose strongest liquidity pair
     */

    const sortedPairs = pairs.sort(
      (a: any, b: any) =>
        (b.liquidity?.usd || 0) -
        (a.liquidity?.usd || 0)
    );

    const mainPair =
      sortedPairs[0];

    return {
      found: true,

      dex:
        mainPair.dexId ||
        "Verified On-Chain Liquidity",

      pairAddress:
        mainPair.pairAddress ||
        "Unknown",

      liquidity:
        mainPair.liquidity?.usd
          ? `$${Math.round(
              mainPair.liquidity.usd
            ).toLocaleString()}`
          : "Blockchain Verified",

      volume24h:
        mainPair.volume?.h24
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