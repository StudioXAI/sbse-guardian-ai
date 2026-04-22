import axios from "axios";

export async function checkDexPair(contractAddress: string) {
  try {
    const url = `https://api.dexscreener.com/latest/dex/tokens/${contractAddress}`;

    const response = await axios.get(url);
    const pairs = response.data?.pairs || [];

    if (!pairs.length) {
      return {
        found: false,
        message: "No active DEX pair found",
      };
    }

    const mainPair = pairs[0];

    return {
      found: true,
      dex: mainPair.dexId || "Unknown DEX",
      pairAddress: mainPair.pairAddress || "Unknown",
      liquidity:
        mainPair.liquidity?.usd
          ? `$${Math.round(mainPair.liquidity.usd).toLocaleString()}`
          : "Unknown",
      volume24h:
        mainPair.volume?.h24
          ? `$${Math.round(mainPair.volume.h24).toLocaleString()}`
          : "Unknown",
    };
  } catch (error) {
    console.error("DEX pair check failed:", error);

    return {
      found: false,
      message: "DEX verification failed",
    };
  }
}