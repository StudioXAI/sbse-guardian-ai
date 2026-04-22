import axios from "axios";

const STABLECOIN_OVERRIDES: Record<
  string,
  {
    projectName: string;
    website: string;
    issuer: string;
    fallbackMarketCap: string;
  }
> = {
  USDC: {
    projectName: "USD Coin",
    website: "https://www.circle.com",
    issuer: "Circle",
    fallbackMarketCap: "$54,653,671,157",
  },

  USDT: {
    projectName: "Tether USD",
    website: "https://tether.to",
    issuer: "Tether",
    fallbackMarketCap: "$140,000,000,000",
  },

  DAI: {
    projectName: "DAI Stablecoin",
    website: "https://makerdao.com",
    issuer: "MakerDAO",
    fallbackMarketCap: "$5,000,000,000",
  },
};

export async function fetchTokenIdentity(
  contractAddress: string
) {
  try {
    /**
     * STEP 1
     * Explorer FIRST
     * Get real token info from blockchain
     */

    const apiKey =
      process.env.ETHERSCAN_API_KEY;

    const explorerUrl = `https://api.etherscan.io/api?module=token&action=tokeninfo&contractaddress=${contractAddress}&apikey=${apiKey}`;

    let symbol = "Unknown";
    let projectName = "Unknown Project";

    try {
      const explorerRes =
        await axios.get(explorerUrl);

      const token =
        explorerRes.data?.result?.[0];

      if (token) {
        symbol =
          token.symbol || "Unknown";

        projectName =
          token.tokenName ||
          "Unknown Project";
      }
    } catch {
      console.log(
        "Explorer token info fallback triggered"
      );
    }

    /**
     * STEP 2
     * Stablecoin override
     * BUT market cap should be LIVE, not static
     */

    if (
      symbol &&
      STABLECOIN_OVERRIDES[
        symbol.toUpperCase()
      ]
    ) {
      const stable =
        STABLECOIN_OVERRIDES[
          symbol.toUpperCase()
        ];

      let liveMarketCap =
        stable.fallbackMarketCap;

      /**
       * CoinGecko live fetch
       */

      try {
        const coinGeckoMap: Record<
          string,
          string
        > = {
          USDC: "usd-coin",
          USDT: "tether",
          DAI: "dai",
        };

        const coinId =
          coinGeckoMap[
            symbol.toUpperCase()
          ];

        if (coinId) {
          const cgUrl = `https://api.coingecko.com/api/v3/coins/${coinId}`;

          const cgResponse =
            await axios.get(cgUrl);

          const marketCap =
            cgResponse.data?.market_data
              ?.market_cap?.usd;

          if (marketCap) {
            liveMarketCap = `$${Math.round(
              marketCap
            ).toLocaleString()}`;
          }
        }
      } catch {
        console.log(
          "CoinGecko fallback to stored market cap"
        );
      }

      return {
        projectName:
          stable.projectName,
        symbol,
        dex:
          "Institutional Liquidity",
        marketCap:
          liveMarketCap,
        website:
          stable.website,
        issuer:
          stable.issuer,
      };
    }

    /**
     * STEP 3
     * Non-stablecoin fallback:
     * DexScreener only AFTER blockchain
     */

    const dexUrl = `https://api.dexscreener.com/latest/dex/tokens/${contractAddress}`;

    const dexResponse =
      await axios.get(dexUrl);

    const pairs =
      dexResponse.data?.pairs || [];

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

    const mainPair =
      sortedPairs[0];

    return {
      projectName:
        mainPair.baseToken?.name ||
        projectName,

      symbol:
        mainPair.baseToken?.symbol ||
        symbol,

      dex:
        mainPair.dexId ||
        "Verified Liquidity Source",

      marketCap:
        mainPair.marketCap
          ? `$${Math.round(
              mainPair.marketCap
            ).toLocaleString()}`
          : "Unknown",

      website:
        mainPair.info?.websites?.[0]
          ?.url || null,
    };
  } catch (error) {
    console.error(
      "Token identity fetch failed:",
      error
    );

    return {
      projectName:
        "Unknown Project",
      symbol: "Unknown",
      dex: "Unknown",
      marketCap: "Unknown",
      website: null,
    };
  }
}