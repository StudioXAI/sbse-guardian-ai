import { ethers } from "ethers";

const OWNABLE_ABI = [
  "function owner() view returns (address)",
];

const ZERO_ADDRESS =
  "0x0000000000000000000000000000000000000000";

export async function ownerCheck(
  tokenAddress: string,
  rpcUrl: string
) {
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    const contract = new ethers.Contract(
      tokenAddress,
      OWNABLE_ABI,
      provider
    );

    const owner = await contract.owner();

    if (!owner) {
      return {
        safe: false,
        risk: "UNKNOWN",
        message: "Owner could not be determined",
        scoreImpact: 1,
      };
    }

    if (owner.toLowerCase() === ZERO_ADDRESS.toLowerCase()) {
      return {
        safe: true,
        risk: "LOW",
        message: "Ownership renounced",
        owner,
        scoreImpact: 0,
      };
    }

    return {
      safe: false,
      risk: "MEDIUM",
      message: `Active owner detected: ${owner}`,
      owner,
      scoreImpact: 2,
    };
  } catch (error) {
    return {
      safe: false,
      risk: "UNKNOWN",
      message:
        "Contract may not implement owner() or ownership check failed",
      scoreImpact: 1,
    };
  }
}