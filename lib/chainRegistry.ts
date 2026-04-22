/* ─────────────────────────────────────────────────────────────
   Chain Registry
   Each chain declares its OWN API key env var so a BscScan
   key is never sent to Etherscan, and vice-versa.
   ───────────────────────────────────────────────────────────── */

export interface ChainEntry {
  id: string;
  name: string;
  chainIdNum: number;
  rpc: string | undefined;
  explorerApi: string;
  apiKeyEnv: string;
  symbol: string;
}

export const CHAIN_REGISTRY: ChainEntry[] = [
  {
    id: "ethereum",
    name: "Ethereum",
    chainIdNum: 1,
    rpc: process.env.ETH_RPC_URL,
    explorerApi: "https://api.etherscan.io/api",
    apiKeyEnv: "ETHERSCAN_API_KEY",
    symbol: "ETH",
  },
  {
    id: "bsc",
    name: "BNB Smart Chain",
    chainIdNum: 56,
    rpc: process.env.BSC_RPC_URL,
    explorerApi: "https://api.bscscan.com/api",
    apiKeyEnv: "BSCSCAN_API_KEY",
    symbol: "BNB",
  },
  {
    id: "polygon",
    name: "Polygon",
    chainIdNum: 137,
    rpc: process.env.POLYGON_RPC_URL,
    explorerApi: "https://api.polygonscan.com/api",
    apiKeyEnv: "POLYGONSCAN_API_KEY",
    symbol: "MATIC",
  },
  {
    id: "base",
    name: "Base",
    chainIdNum: 8453,
    rpc: process.env.BASE_RPC_URL,
    explorerApi: "https://api.basescan.org/api",
    apiKeyEnv: "BASESCAN_API_KEY",
    symbol: "ETH",
  },
  {
    id: "arbitrum",
    name: "Arbitrum",
    chainIdNum: 42161,
    rpc: process.env.ARBITRUM_RPC_URL,
    explorerApi: "https://api.arbiscan.io/api",
    apiKeyEnv: "ARBISCAN_API_KEY",
    symbol: "ETH",
  },
  {
    id: "avalanche",
    name: "Avalanche",
    chainIdNum: 43114,
    rpc: process.env.AVALANCHE_RPC_URL,
    explorerApi: "https://api.snowtrace.io/api",
    apiKeyEnv: "SNOWTRACE_API_KEY",
    symbol: "AVAX",
  },
];

/**
 * Resolve the correct API key for a given chain.
 * Falls back to ETHERSCAN_API_KEY for dev convenience.
 */
export function getExplorerApiKey(chain: ChainEntry): string {
  return process.env[chain.apiKeyEnv] || process.env.ETHERSCAN_API_KEY || "";
}
