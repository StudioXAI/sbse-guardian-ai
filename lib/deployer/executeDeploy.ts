/* ─────────────────────────────────────────────────────────────
   executeDeploy — Wagmi/viem-based contract deployment

   v29.5 SIMPLIFICATION: Fees removed. Mainnet deploys are free
   for everyone in this version. The InvertX holdings gate (see
   invertxGate.ts) will replace fee gating in a future version
   when InvertX launches.

   This module is now a thin wrapper around Wagmi's deployContract
   action that works for both testnet and mainnet chain IDs.
   ───────────────────────────────────────────────────────────── */

import {
  getWalletClient,
  waitForTransactionReceipt,
  deployContract,
  type Config,
} from "@wagmi/core";
import { wagmiConfig } from "@/lib/deployer/wagmiConfig";
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

/**
 * Build the constructor args for a template + params combo,
 * matching the constructor signature in the template.
 */
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

export async function executeDeploy(
  input: ExecuteDeployInput,
): Promise<ExecuteDeployResult> {
  const { chain, template, parameters, isMainnet } = input;

  if (!template.bytecodeReady) {
    throw new Error(
      "Template bytecode is not populated. Compile the template via Hardhat (see lib/deployer/templates/erc20-ozv5.bytecode.ts) before deploying.",
    );
  }

  /* Pick the chain ID based on mode. Mainnet vs testnet is the
     only branch in this whole module. */
  const chainIdToUse = isMainnet
    ? chain.mainnetChainId
    : chain.testnetChainId;
  const chainName = isMainnet ? chain.name : chain.testnetName;

  const args = buildConstructorArgs(template, parameters);
  const abi = buildConstructorAbi(template);

  /* Confirm wallet is connected on the chosen chain. */
  const walletClient = await getWalletClient(wagmiConfig as Config, {
    chainId: chainIdToUse,
  });
  if (!walletClient) {
    throw new Error(
      `No wallet connected to chain ${chainIdToUse}. Connect your wallet and switch to ${chainName}.`,
    );
  }

  /* Submit deploy. The user's wallet prompts for signature. */
  const txHash = await deployContract(wagmiConfig as Config, {
    abi,
    bytecode: template.bytecode,
    args,
    chainId: chainIdToUse,
  });

  /* Wait for confirmation. Mainnet deploys may take 1-3 minutes
     during high gas; testnets usually under 30 seconds. */
  const receipt = await waitForTransactionReceipt(wagmiConfig as Config, {
    hash: txHash,
    chainId: chainIdToUse,
    timeout: 300_000, // 5 minutes
  });

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
