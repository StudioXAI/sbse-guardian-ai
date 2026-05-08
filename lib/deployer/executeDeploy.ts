/* ─────────────────────────────────────────────────────────────
   executeDeploy — viem-based contract deployment

   v30.1 FIX: Replaced @wagmi/core deployContract with viem's
   createWalletClient + custom(window.ethereum) + walletClient
   .deployContract. This bypasses a dual-config problem where
   Reown's AppKit (using EthersAdapter) and the deployer's
   standalone @wagmi/core config didn't share connection state.
   The wallet would connect through Reown but @wagmi/core would
   throw "Connector not connected" because its config never saw
   the connection.

   By talking to window.ethereum directly via viem's custom
   transport, we use whatever EIP-1193 provider the wallet
   exposes (MetaMask, WalletConnect via Reown, etc.) without
   any Wagmi config in the picture.
   ───────────────────────────────────────────────────────────── */

import {
  createWalletClient,
  createPublicClient,
  custom,
  http,
  type Chain,
  type Hex,
} from "viem";
import {
  mainnet,
  bsc,
  polygon,
  arbitrum,
  optimism,
  base,
  sepolia,
  bscTestnet,
  polygonAmoy,
  arbitrumSepolia,
  optimismSepolia,
  baseSepolia,
} from "viem/chains";
import type { DeployerChain } from "./chains";
import type { TokenTemplate } from "./templates";

export interface ExecuteDeployInput {
  chain: DeployerChain;
  template: TokenTemplate;
  parameters: Record<string, string | number>;
  deployerAddress: string;
  /** Whether this is a mainnet deploy. Drives chain ID selection. */
  isMainnet: boolean;
}

export interface ExecuteDeployResult {
  contractAddress: string;
  txHash: string;
  blockNumber: number;
  /** The actual chain ID used for deploy (testnet or mainnet). */
  chainId: number;
}

/* ═══════════════════════════════════════════════════════════ */
/* Chain ID → viem chain object                                 */
/* ═══════════════════════════════════════════════════════════ */

/**
 * Map a chain ID to its viem chain object. Required by
 * createWalletClient and createPublicClient so they know how
 * to format requests for the network (block time, native
 * symbol, RPC URLs for the public client, etc.).
 */
function getViemChain(chainId: number): Chain {
  switch (chainId) {
    /* Mainnets */
    case 1: return mainnet;
    case 56: return bsc;
    case 137: return polygon;
    case 42161: return arbitrum;
    case 10: return optimism;
    case 8453: return base;
    /* Testnets */
    case 11155111: return sepolia;
    case 97: return bscTestnet;
    case 80002: return polygonAmoy;
    case 421614: return arbitrumSepolia;
    case 11155420: return optimismSepolia;
    case 84532: return baseSepolia;
    default:
      throw new Error(`Unsupported chain ID: ${chainId}`);
  }
}

/* ═══════════════════════════════════════════════════════════ */
/* Constructor args + ABI assembly                              */
/* ═══════════════════════════════════════════════════════════ */

function buildConstructorArgs(
  template: TokenTemplate,
  parameters: Record<string, string | number>,
): unknown[] {
  return template.parameters.map((p) => {
    const v = parameters[p.name];
    switch (p.solidityType) {
      case "string":
        return String(v ?? "");
      case "uint8":
        return Number(v ?? 0);
      case "uint256":
        return BigInt(v ?? 0);
      case "address":
        return v;
      default:
        return v;
    }
  });
}

function buildConstructorAbi(template: TokenTemplate) {
  return [
    {
      type: "constructor",
      inputs: template.parameters.map((p) => ({
        name: p.name,
        type: p.solidityType,
      })),
      stateMutability: "nonpayable" as const,
    },
  ];
}

/* ═══════════════════════════════════════════════════════════ */
/* The deploy entrypoint                                        */
/* ═══════════════════════════════════════════════════════════ */

export async function executeDeploy(
  input: ExecuteDeployInput,
): Promise<ExecuteDeployResult> {
  const { chain, template, parameters, isMainnet } = input;

  if (!template.bytecodeReady) {
    throw new Error(
      "Template bytecode is not populated. Compile the template via Hardhat before deploying.",
    );
  }

  /* Verify window.ethereum is available — i.e. some wallet has
     injected an EIP-1193 provider. Reown's EthersAdapter uses
     this same provider, so when the user connects via Reown's
     modal, this code sees the connection. */
  if (typeof window === "undefined" || !(window as any).ethereum) {
    throw new Error(
      "No injected wallet provider found. Please connect a browser wallet (MetaMask, Rabby, etc.) and try again.",
    );
  }

  const chainIdToUse = isMainnet
    ? chain.mainnetChainId
    : chain.testnetChainId;
  const chainName = isMainnet ? chain.name : chain.testnetName;
  const viemChain = getViemChain(chainIdToUse);

  const args = buildConstructorArgs(template, parameters);
  const abi = buildConstructorAbi(template);

  /* Build a wallet client that talks to whatever wallet has
     injected window.ethereum. */
  const walletClient = createWalletClient({
    chain: viemChain,
    transport: custom((window as any).ethereum),
  });

  /* Verify the wallet is on the right chain. If not, ask it to
     switch — most wallets show a chain-switch confirmation prompt. */
  const currentChainId = await walletClient.getChainId();
  if (currentChainId !== chainIdToUse) {
    try {
      await walletClient.switchChain({ id: chainIdToUse });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Wallet is on chain ${currentChainId} but deploy target is ${chainName} (${chainIdToUse}). Switch failed: ${msg}`,
      );
    }
  }

  /* Get the connected account. */
  const accounts = await walletClient.getAddresses();
  if (accounts.length === 0) {
    throw new Error(
      "No accounts available from the connected wallet. Reconnect and try again.",
    );
  }
  const account = accounts[0];

  /* Submit deploy. This prompts the user's wallet to sign the
     contract creation transaction. */
  let txHash: Hex;
  try {
    txHash = await walletClient.deployContract({
      abi,
      bytecode: template.bytecode,
      args,
      account,
      chain: viemChain,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/user rejected|user denied|action_rejected/i.test(msg)) {
      throw new Error("Deploy cancelled — you rejected the transaction in your wallet.");
    }
    throw new Error(`Deploy submit failed: ${msg}`);
  }

  /* Wait for the receipt via a public client (read-only RPC).

     IMPORTANT: pass an explicit RPC URL rather than letting viem
     pick its default. viem's chain defaults are sometimes free
     public nodes that rate-limit aggressively when we poll every
     few seconds for receipt. We use the same RPC URLs already
     defined in chains.ts for the rest of the app — these are
     vetted and reliable. */
  const rpcUrl = isMainnet ? chain.mainnetRpcUrl : chain.testnetRpcUrl;
  const publicClient = createPublicClient({
    chain: viemChain,
    transport: http(rpcUrl),
  });

  let receipt;
  try {
    receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      timeout: 300_000, // 5 minutes
      pollingInterval: 4_000,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    /* The deploy tx already succeeded on-chain (we have txHash and
       it was broadcast). The failure here is just our receipt poll
       hitting an RPC issue. Surface a clear message that includes
       the tx hash so the user can see the contract on the explorer
       even if the wizard couldn't fetch the receipt. */
    const explorerBase = isMainnet ? chain.mainnetExplorer : chain.testnetExplorer;
    throw new Error(
      `Transaction sent (${txHash.slice(0, 10)}…) but receipt fetch failed: ${msg}. Check ${explorerBase}/tx/${txHash} to see if it succeeded — if so, your contract is deployed even though the wizard couldn't show it.`,
    );
  }

  if (receipt.status !== "success") {
    throw new Error(
      "Deploy transaction reverted on-chain. Your gas was spent. Check the transaction on the block explorer for the revert reason.",
    );
  }

  if (!receipt.contractAddress) {
    throw new Error(
      "Transaction confirmed but no contract address in receipt. Check the block explorer for the deployment.",
    );
  }

  return {
    contractAddress: receipt.contractAddress,
    txHash,
    blockNumber: Number(receipt.blockNumber),
    chainId: chainIdToUse,
  };
}
