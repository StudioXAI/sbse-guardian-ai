import axios from "axios";

const STABLECOINS: Record<string, any> = {
  USDC: {
    issuer: "Circle",
    website: "https://www.circle.com",
    marketCap: "$54,653,671,157",
    tokenType: "Stablecoin",
  },
  USDT: {
    issuer: "Tether",
    website: "https://tether.to",
    marketCap: "$140,000,000,000+",
    tokenType: "Stablecoin",
  },
  DAI: {
    issuer: "MakerDAO",
    website: "https://makerdao.com",
    marketCap: "$5,000,000,000+",
    tokenType: "Stablecoin",
  },
};

export async function fetchTokenIdentity(
  contractAddress: string
) {
  try {
    /**
     * STEP 1
     * Etherscan verified metadata first
     */

    const apiKey = process.env.ETHERSCAN_API_KEY;

    const explorerUrl = `https://api.etherscan.io/api?module=token&action=tokeninfo&contractaddress=${contractAddress}&apikey=${apiKey}`;

    const explorerRes = await axios.get(explorerUrl);

    const explorerData =
      explorerRes.data?.result?.[0] || null;

    let symbol =
      explorerData?.symbol ||
      explorerData?.tokenSymbol ||
      "Unknown";

    let projectName =
      explorerData?.tokenName ||
      explorerData?.name ||
      "Unknown Project";

    /**
     * STEP 2
     * Stablecoin override
     */

    if (STABLECOINS[symbol]) {
      return {
        projectName,
        symbol,
        dex: "Institutional Liquidity",
        marketCap: STABLECOINS[symbol].marketCap,
        website: STABLECOINS[symbol].website,
        issuer: STABLECOINS[symbol].issuer,
        tokenType: STABLECOINS[symbol].tokenType,
        isStablecoin: true,
      };
    }

    /**
     * STEP 3
     * DexScreener fallback only
     */

    const dexUrl = `https://api.dexscreener.com/latest/dex/tokens/${contractAddress}`;

    const dexRes = await axios.get(dexUrl);

    const pairs = dexRes.data?.pairs || [];

    if (!pairs.length) {
      return {
        projectName,
        symbol,
        dex: "Unknown",
        marketCap: "Unknown",
        website: null,
        issuer: null,
        tokenType: "Standard Token",
        isStablecoin: false,
      };
    }

    const mainPair = pairs[0];

    return {
      projectName:
        mainPair.baseToken?.name || projectName,
      symbol:
        mainPair.baseToken?.symbol || symbol,
      dex: mainPair.dexId || "Unknown DEX",
      marketCap: mainPair.marketCap
        ? `$${Math.round(
            mainPair.marketCap
          ).toLocaleString()}`
        : "Unknown",
      website:
        mainPair.info?.websites?.[0]?.url || null,
      issuer: null,
      tokenType: "Standard Token",
      isStablecoin: false,
    };
  } catch (error) {
    console.error(
      "Token identity fetch failed:",
      error
    );

    return {
      projectName: "Unknown Project",
      symbol: "Unknown",
      dex: "Unknown",
      marketCap: "Unknown",
      website: null,
      issuer: null,
      tokenType: "Unknown",
      isStablecoin: false,
    };
  }
}