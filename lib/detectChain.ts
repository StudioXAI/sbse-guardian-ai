import axios from "axios";
import { CHAIN_REGISTRY } from "./chainRegistry";

export async function detectChain(
  contractAddress: string
) {
  /**
   * STEP 1
   * Scan ALL supported chains from registry
   */

  for (const chain of CHAIN_REGISTRY) {
    try {
      /**
       * Skip chains without explorer API
       */

      if (!chain.explorerApi) continue;

      /**
       * SAFE apiKey handling
       */

      let apiKey =
        process.env.ETHERSCAN_API_KEY || "";

      if (
        "apiKeyEnv" in chain &&
        chain.apiKeyEnv &&
        typeof chain.apiKeyEnv === "string"
      ) {
        const customKey =
          process.env[chain.apiKeyEnv];

        if (customKey) {
          apiKey = customKey;
        }
      }

      const url = `${chain.explorerApi}?module=contract&action=getsourcecode&address=${contractAddress}&apikey=${apiKey}`;

      const response = await axios.get(url);

      const result =
        response.data?.result?.[0];

      /**
       * Stronger verification:
       * contract exists + ABI exists
       */

      const hasVerifiedContract =
        !!result &&
        (
          !!result.ContractName ||
          !!result.SourceCode ||
          !!result.ABI
        ) &&
        result.ABI !==
          "Contract source code not verified" &&
        result.ABI !==
          "Invalid Address format";

      if (hasVerifiedContract) {
        return {
          found: true,
          chainId: chain.id,
          chainName: chain.name,

          rpc:
            chain.rpc ||
            process.env.ETH_RPC_URL ||
            "https://eth.llamarpc.com",

          explorerApi:
            chain.explorerApi ||
            "https://api.etherscan.io/api",

          symbol:
            chain.symbol || "ETH",

          scannerType: "Explorer API",
        };
      }
    } catch (error) {
      console.log(
        `Chain check failed on ${chain.name}`
      );
    }
  }

  /**
   * STEP 2
   * RPC fallback detection
   */

  for (const chain of CHAIN_REGISTRY) {
    try {
      if (!chain.rpc) continue;

      const rpcPayload = {
        jsonrpc: "2.0",
        method: "eth_getCode",
        params: [contractAddress, "latest"],
        id: 1,
      };

      const rpcResponse = await axios.post(
        chain.rpc,
        rpcPayload,
        {
          headers: {
            "Content-Type":
              "application/json",
          },
          timeout: 5000,
        }
      );

      const code =
        rpcResponse.data?.result;

      /**
       * If bytecode exists,
       * contract exists on chain
       */

      if (
        code &&
        code !== "0x" &&
        code.length > 10
      ) {
        return {
          found: true,
          chainId: chain.id,
          chainName: chain.name,

          rpc:
            chain.rpc ||
            "https://eth.llamarpc.com",

          explorerApi:
            chain.explorerApi ||
            "No Explorer API",

          symbol:
            chain.symbol || "ETH",

          scannerType: "RPC Detection",
        };
      }
    } catch (error) {
      console.log(
        `RPC detection failed on ${chain.name}`
      );
    }
  }

  /**
   * STEP 3
   * Final fallback
   */

  return {
    found: false,
    chainId: "ethereum",
    chainName: "Ethereum",

    rpc:
      process.env.ETH_RPC_URL ||
      "https://eth.llamarpc.com",

    explorerApi:
      "https://api.etherscan.io/api",

    symbol: "ETH",
    scannerType: "Fallback",
  };
}