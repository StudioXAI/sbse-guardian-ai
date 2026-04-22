import axios from "axios";
import { CHAIN_REGISTRY } from "./chainRegistry";

export async function detectChain(contractAddress: string) {
  for (const chain of CHAIN_REGISTRY) {
    try {
      if (!chain.explorerApi) continue;

      const url = `${chain.explorerApi}?module=contract&action=getsourcecode&address=${contractAddress}&apikey=${process.env.ETHERSCAN_API_KEY}`;

      const response = await axios.get(url);

      const result = response.data?.result?.[0];

      if (
        result &&
        result.ContractName !== "" &&
        result.ABI !== "Contract source code not verified"
      ) {
        return {
          found: true,
          chainId: chain.id,
          chainName: chain.name,
          rpc: chain.rpc,
          explorerApi: chain.explorerApi,
          symbol: chain.symbol,
        };
      }
    } catch (error) {
      console.log(`Chain check failed on ${chain.name}`);
    }
  }

  return {
    found: false,
    chainId: "ethereum",
    chainName: "Ethereum",
    rpc:
      process.env.ETH_RPC_URL ||
      "https://eth.llamarpc.com",
    explorerApi: "https://api.etherscan.io/api",
    symbol: "ETH",
  };
}