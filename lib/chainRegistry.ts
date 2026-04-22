export const CHAIN_REGISTRY = [
  {
    id: "ethereum",
    name: "Ethereum",
    rpc: process.env.ETH_RPC_URL,
    explorerApi: "https://api.etherscan.io/api",
    symbol: "ETH",
  },
  {
    id: "bsc",
    name: "BNB Smart Chain",
    rpc: process.env.BSC_RPC_URL,
    explorerApi: "https://api.bscscan.com/api",
    symbol: "BNB",
  },
  {
    id: "polygon",
    name: "Polygon",
    rpc: process.env.POLYGON_RPC_URL,
    explorerApi: "https://api.polygonscan.com/api",
    symbol: "MATIC",
  },
  {
    id: "base",
    name: "Base",
    rpc: process.env.BASE_RPC_URL,
    explorerApi: "https://api.basescan.org/api",
    symbol: "ETH",
  },
  {
    id: "arbitrum",
    name: "Arbitrum",
    rpc: process.env.ARBITRUM_RPC_URL,
    explorerApi: "https://api.arbiscan.io/api",
    symbol: "ETH",
  },
  {
    id: "avalanche",
    name: "Avalanche",
    rpc: process.env.AVALANCHE_RPC_URL,
    explorerApi: "https://api.snowtrace.io/api",
    symbol: "AVAX",
  },
];