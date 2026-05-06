/* ─────────────────────────────────────────────────────────────
   executeDeploy — Wagmi/viem-based contract deployment

   Called from the wizard's deploy step. Builds the constructor
   calldata, asks the user's connected wallet to sign and broadcast
   the deployment transaction, waits for confirmation, and returns
   the deployed contract address from the receipt.

   This is a thin wrapper around Wagmi's deployContract action.
   The reason it lives in its own module: dynamic import in the
   wizard component, so Wagmi internals don't get pulled into
   the initial bundle.
   ───────────────────────────────────────────────────────────── */

import type { Address } from "viem";
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
}

export interface ExecuteDeployResult {
  contractAddress: string;
  txHash: string;
  blockNumber: number;
}

/**
 * Build the constructor calldata for a template + params combo.
 * The bytecode the user signs is `template.bytecode + encodedArgs`.
 * Wagmi handles this automatically when we pass `args`, but we
 * still need to assemble the args array in the correct order
 * matching the constructor signature.
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
        /* Constructor expects raw uint256. Initial supply is given
           in whole tokens (e.g. 1_000_000) and the contract scales
           by 10**decimals internally — so just BigInt the value. */
        return BigInt(v ?? 0);
      case "address":
        return v as Address;
      default:
        return v;
    }
  });
}

/**
 * Build a constructor signature string from the template parameters.
 * Used for the ABI required by viem's deployContract action.
 */
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
  const { chain, template, parameters } = input;

  if (!template.bytecodeReady) {
    throw new Error(
      "Template bytecode is not populated. Compile the template via Hardhat (see lib/deployer/templates/erc20-ozv5.bytecode.ts) before deploying.",
    );
  }

  const args = buildConstructorArgs(template, parameters);
  const abi = buildConstructorAbi(template);

  /* Confirm we have a wallet client on the right chain. */
  const walletClient = await getWalletClient(wagmiConfig as Config, {
    chainId: chain.testnetChainId,
  });
  if (!walletClient) {
    throw new Error(
      `No wallet connected to chain ${chain.testnetChainId}. Connect your wallet and switch to ${chain.testnetName}.`,
    );
  }

  /* Submit deploy. This prompts the user's wallet to sign. */
  const txHash = await deployContract(wagmiConfig as Config, {
    abi,
    bytecode: template.bytecode,
    args,
    chainId: chain.testnetChainId,
  });

  /* Wait for confirmation. The receipt contains the deployed
     contract address. */
  const receipt = await waitForTransactionReceipt(wagmiConfig as Config, {
    hash: txHash,
    chainId: chain.testnetChainId,
    timeout: 180_000, // 3 minutes
  });

  if (receipt.status !== "success") {
    throw new Error(
      "Deploy transaction reverted on-chain. Your gas was spent. Check the transaction on the block explorer for the revert reason.",
    );
  }

  if (!receipt.contractAddress) {
    throw new Error(
      "Transaction confirmed but no contract address in receipt. This is unexpected — please check the block explorer for the deployment.",
    );
  }

  return {
    contractAddress: receipt.contractAddress,
    txHash,
    blockNumber: Number(receipt.blockNumber),
  };
}
