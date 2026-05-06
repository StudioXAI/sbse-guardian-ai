/* ─────────────────────────────────────────────────────────────
   Deployer Chain Config

   Defines:
   - Testnet for each supported mainnet (used by v29 wizard)
   - Hardcoded native-token fee per chain in wei (used by v29.5)
   - Whether this chain is currently enabled for deployment
   - Block explorer URLs (mainnet + testnet) for verification later

   PHILOSOPHY ON FEES:
   We chose hardcoded fees over a price oracle for simplicity. The
   trade-off: when ETH spikes from $2K to $4K, your $5 USDT-equivalent
   fee on Ethereum becomes $10. Adjust by updating the constants
   below and pushing a code change, OR override per-chain via env
   vars (DEPLOYER_FEE_ETH_WEI, DEPLOYER_FEE_BNB_WEI, etc.) without
   a code deploy.

   v29 NOTE: fees are NOT collected on testnet. The constants below
   are reference for v29.5 mainnet. Testnet deploys are free except
   for the user's own gas.
   ───────────────────────────────────────────────────────────── */

export type DeployerChainId = "ethereum" | "bsc" | "polygon" | "arbitrum" | "optimism" | "base";

export interface DeployerChain {
  id: DeployerChainId;
  /** Display name shown to users. */
  name: string;
  /** Mainnet chain ID (used in v29.5). */
  mainnetChainId: number;
  /** Testnet chain ID (used in v29). */
  testnetChainId: number;
  /** Testnet display name (Sepolia, Amoy, etc.). */
  testnetName: string;
  /** Native token symbol (ETH, BNB, POL, AVAX). */
  nativeSymbol: string;
  /** Mainnet block explorer base URL. */
  mainnetExplorer: string;
  /** Testnet block explorer base URL. */
  testnetExplorer: string;
  /** Public RPC URL for the testnet — used for the wizard's
      balance-check feature. These are free public endpoints
      provided by chain foundations or major operators. They have
      generous rate limits suitable for occasional balance reads
      from individual users. */
  testnetRpcUrl: string;
  /** Hardcoded mainnet fee in wei. ~$5 USDT equivalent at the
      time of writing. Update as native prices drift, OR set env
      var DEPLOYER_FEE_<SYMBOL>_WEI to override at runtime. */
  mainnetFeeWei: bigint;
  /** Faucet URL for testnet (so users can get test tokens). */
  testnetFaucetUrl: string;
}

/* Hardcoded fees calibrated to ~$5 USDT at typical mid-2026 prices.
   ETH at ~$2500: 0.002 ETH ≈ $5
   BNB at ~$600:  0.0083 BNB ≈ $5
   POL at ~$0.40: 12.5 POL ≈ $5
   These are stale the moment prices move — that's the trade-off
   you accepted with hardcoded fees vs. price oracle. */

export const DEPLOYER_CHAINS: Record<DeployerChainId, DeployerChain> = {
  ethereum: {
    id: "ethereum",
    name: "Ethereum",
    mainnetChainId: 1,
    testnetChainId: 11155111, // Sepolia
    testnetName: "Sepolia",
    nativeSymbol: "ETH",
    mainnetExplorer: "https://etherscan.io",
    testnetExplorer: "https://sepolia.etherscan.io",
    testnetRpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
    mainnetFeeWei: BigInt("2000000000000000"), // 0.002 ETH
    testnetFaucetUrl: "https://sepoliafaucet.com",
  },
  bsc: {
    id: "bsc",
    name: "BNB Chain",
    mainnetChainId: 56,
    testnetChainId: 97,
    testnetName: "BSC Testnet",
    nativeSymbol: "BNB",
    mainnetExplorer: "https://bscscan.com",
    testnetExplorer: "https://testnet.bscscan.com",
    testnetRpcUrl: "https://data-seed-prebsc-1-s1.binance.org:8545",
    mainnetFeeWei: BigInt("8300000000000000"), // 0.0083 BNB
    testnetFaucetUrl: "https://www.bnbchain.org/en/testnet-faucet",
  },
  polygon: {
    id: "polygon",
    name: "Polygon",
    mainnetChainId: 137,
    testnetChainId: 80002, // Amoy
    testnetName: "Amoy",
    nativeSymbol: "POL",
    mainnetExplorer: "https://polygonscan.com",
    testnetExplorer: "https://amoy.polygonscan.com",
    testnetRpcUrl: "https://rpc-amoy.polygon.technology",
    mainnetFeeWei: BigInt("12500000000000000000"), // 12.5 POL
    testnetFaucetUrl: "https://faucet.polygon.technology",
  },
  arbitrum: {
    id: "arbitrum",
    name: "Arbitrum",
    mainnetChainId: 42161,
    testnetChainId: 421614, // Arbitrum Sepolia
    testnetName: "Arbitrum Sepolia",
    nativeSymbol: "ETH",
    mainnetExplorer: "https://arbiscan.io",
    testnetExplorer: "https://sepolia.arbiscan.io",
    testnetRpcUrl: "https://sepolia-rollup.arbitrum.io/rpc",
    mainnetFeeWei: BigInt("2000000000000000"), // 0.002 ETH
    testnetFaucetUrl: "https://faucet.quicknode.com/arbitrum/sepolia",
  },
  optimism: {
    id: "optimism",
    name: "Optimism",
    mainnetChainId: 10,
    testnetChainId: 11155420, // OP Sepolia
    testnetName: "OP Sepolia",
    nativeSymbol: "ETH",
    mainnetExplorer: "https://optimistic.etherscan.io",
    testnetExplorer: "https://sepolia-optimism.etherscan.io",
    testnetRpcUrl: "https://sepolia.optimism.io",
    mainnetFeeWei: BigInt("2000000000000000"),
    testnetFaucetUrl: "https://app.optimism.io/faucet",
  },
  base: {
    id: "base",
    name: "Base",
    mainnetChainId: 8453,
    testnetChainId: 84532, // Base Sepolia
    testnetName: "Base Sepolia",
    nativeSymbol: "ETH",
    mainnetExplorer: "https://basescan.org",
    testnetExplorer: "https://sepolia.basescan.org",
    testnetRpcUrl: "https://sepolia.base.org",
    mainnetFeeWei: BigInt("2000000000000000"),
    testnetFaucetUrl: "https://faucet.quicknode.com/base/sepolia",
  },
};

/**
 * Resolve the actual fee for a chain, applying any env var override.
 * Used in v29.5 mainnet flow.
 */
export function getMainnetFeeWei(chainId: DeployerChainId): bigint {
  const chain = DEPLOYER_CHAINS[chainId];
  const envKey = `DEPLOYER_FEE_${chain.nativeSymbol}_WEI`;
  const override = process.env[envKey];
  if (override) {
    try {
      return BigInt(override);
    } catch {
      /* Ignore bad env value, fall through to hardcoded */
    }
  }
  return chain.mainnetFeeWei;
}

export function listDeployerChains(): DeployerChain[] {
  return Object.values(DEPLOYER_CHAINS);
}
