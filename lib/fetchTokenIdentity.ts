import axios from "axios";

const STABLECOIN_OVERRIDES: Record<
  string,
  {
    projectName: string;
    website: string;
    issuer: string;
    fallbackMarketCap: string;
    knownContracts?: string[];
  }
> = {
  USDC: {
    projectName: "USD Coin",
    website: "https://www.circle.com",
    issuer: "Circle",
    fallbackMarketCap: "$54,653,671,157",
    knownContracts: [
      "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // Ethereum
    ],
  },

  USDT: {
    projectName: "Tether USD",
    website: "https://tether.to",
    issuer: "Tether",
    fallbackMarketCap: "$140,000,000,000",
    knownContracts: [
      "0xdac17f958d2ee523a2206206994597c13d831ec7", // Ethereum
    ],
  },

  DAI: {
    projectName: "DAI Stablecoin",
    website: "https://makerdao.com",
    issuer: "MakerDAO",
    fallbackMarketCap: "$5,000,000,000",
    knownContracts: [
      "0x6b175474e89094c44da98b954eedeac495271d0f", // Ethereum
    ],
  },
};

function detectKnownStablecoinByAddress(
  contractAddress: string
): string | null {
  const normalized = contractAddress.toLowerCase();

  for (const [symbol, config] of Object.entries(
    STABLECOIN_OVERRIDES
  )) {
    if (
      config.knownContracts?.some(
        (addr) => addr.toLowerCase() === normalized
      )
    ) {
      return symbol;
    }
  }

  return null;
}

async function fetchLiveStablecoinMarketCap(
  symbol: string,
  fallback: string
) {
  try {
    const coinGeckoMap: Record<string, string> = {
      USDC: "usd-coin",
      USDT: "tether",
      DAI: "dai",
    };

    const coinId = coinGeckoMap[symbol.toUpperCase()];

    if (!coinId) return fallback;

    const cgUrl = `https://api.coingecko.com/api/v3/coins/${coinId}`;

    const cgResponse = await axios.get(cgUrl);

    const marketCap =
      cgResponse.data?.market_data?.market_cap?.usd;

    if (!marketCap) return fallback;

    return `$${Math.round(marketCap).toLocaleString()}`;
  } catch {
    console.log(
      "CoinGecko fallback to stored market cap"
    );

    return fallback;
  }
}

export async function fetchTokenIdentity(
  contractAddress: string
) {
  try {
    /**
     * STEP 0
     * HARD OVERRIDE FIRST
     * Critical fix for USDC / USDT / DAI
     */

    const forcedStablecoin =
      detectKnownStablecoinByAddress(contractAddress);

    if (
      forcedStablecoin &&
      STABLECOIN_OVERRIDES[forcedStablecoin]
    ) {
      const stable =
        STABLECOIN_OVERRIDES[forcedStablecoin];

      const liveMarketCap =
        await fetchLiveStablecoinMarketCap(
          forcedStablecoin,
          stable.fallbackMarketCap
        );

      return {
        projectName: stable.projectName,
        symbol: forcedStablecoin,
        dex: "Institutional Liquidity",
        marketCap: liveMarketCap,
        website: stable.website,
        issuer: stable.issuer,
      };
    }

    /**
     * STEP 1
     * Explorer FIRST
     */

    const apiKey = process.env.ETHERSCAN_API_KEY;

    const explorerUrl = `https://api.etherscan.io/api?module=token&action=tokeninfo&contractaddress=${contractAddress}&apikey=${apiKey}`;

    let symbol = "Unknown";
    let projectName = "Unknown Project";

    try {
      const explorerRes = await axios.get(explorerUrl);

      const token = explorerRes.data?.result?.[0];

      if (token) {
        symbol = token.symbol || "Unknown";
        projectName =
          token.tokenName || "Unknown Project";
      }
    } catch {
      console.log(
        "Explorer token info fallback triggered"
      );
    }

    /**
     * STEP 2
     * Symbol-based stablecoin override
     */

    if (
      symbol &&
      STABLECOIN_OVERRIDES[symbol.toUpperCase()]
    ) {
      const stable =
        STABLECOIN_OVERRIDES[symbol.toUpperCase()];

      const liveMarketCap =
        await fetchLiveStablecoinMarketCap(
          symbol,
          stable.fallbackMarketCap
        );

      return {
        projectName: stable.projectName,
        symbol,
        dex: "Institutional Liquidity",
        marketCap: liveMarketCap,
        website: stable.website,
        issuer: stable.issuer,
      };
    }

    /**
     * STEP 3
     * Non-stablecoin fallback:
     * DexScreener only AFTER blockchain detection
     */

    const dexUrl = `https://api.dexscreener.com/latest/dex/tokens/${contractAddress}`;

    const dexResponse = await axios.get(dexUrl);

    const pairs = dexResponse.data?.pairs || [];

    if (!pairs.length) {
      return {
        projectName,
        symbol,
        dex: "Unknown",
        marketCap: "Unknown",
        website: null,
      };
    }

    /**
     * Choose strongest pair
     */

    const sortedPairs = pairs.sort(
      (a: any, b: any) =>
        (b.liquidity?.usd || 0) -
        (a.liquidity?.usd || 0)
    );

    const mainPair = sortedPairs[0];

    return {
      projectName:
        mainPair.baseToken?.name || projectName,

      symbol:
        mainPair.baseToken?.symbol || symbol,

      dex:
        mainPair.dexId ||
        "Verified Liquidity Source",

      marketCap: mainPair.marketCap
        ? `$${Math.round(
            mainPair.marketCap
          ).toLocaleString()}`
        : "Unknown",

      website:
        mainPair.info?.websites?.[0]?.url || null,
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
    };
  }
}