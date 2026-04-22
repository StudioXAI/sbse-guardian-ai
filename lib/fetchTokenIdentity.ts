import axios from "axios";

export async function fetchTokenIdentity(contractAddress: string) {
  try {
    const url = `https://api.dexscreener.com/latest/dex/tokens/${contractAddress}`;

    const response = await axios.get(url);
    const pairs = response.data?.pairs || [];

    if (!pairs.length) {
      return {
        projectName: "Unknown Project",
        symbol: "Unknown",
        dex: "Unknown",
        marketCap: "Unknown",
        website: null,
      };
    }

    const mainPair = pairs[0];

    return {
      projectName: mainPair.baseToken?.name || "Unknown Project",
      symbol: mainPair.baseToken?.symbol || "Unknown",
      dex: mainPair.dexId || "Unknown DEX",
      marketCap: mainPair.marketCap
        ? `$${Math.round(mainPair.marketCap).toLocaleString()}`
        : "Unknown",
      website:
        mainPair.info?.websites?.[0]?.url || null,
    };
  } catch (error) {
    console.error("Token identity fetch failed:", error);

    return {
      projectName: "Unknown Project",
      symbol: "Unknown",
      dex: "Unknown",
      marketCap: "Unknown",
      website: null,
    };
  }
}