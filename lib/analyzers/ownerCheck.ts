/* ─────────────────────────────────────────────────────────────
   Owner Check
   ───────────────────────────────────────────────────────────── */

import { ethers } from "ethers";
import { isInstitutional, debug } from "../constants";
import type { CheckResult } from "./honeypotCheck";

export type OwnerCheckResult = CheckResult & { owner?: string };

const OWNABLE_ABI = ["function owner() view returns (address)"];
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export async function ownerCheck(
  tokenAddress: string,
  rpcUrl: string,
  symbol?: string,
): Promise<OwnerCheckResult> {
  try {
    if (isInstitutional(symbol)) {
      return {
        safe: true,
        risk: "LOW",
        message: "Institutional token — regulated ownership model accepted",
        owner: "Institutional Governance",
        scoreImpact: 0,
      };
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, { staticNetwork: true });
    const contract = new ethers.Contract(tokenAddress, OWNABLE_ABI, provider);
    const owner: string = await contract.owner();

    if (!owner) {
      return {
        safe: false,
        risk: "UNKNOWN",
        message: "Owner could not be determined",
        scoreImpact: 1,
      };
    }

    if (owner.toLowerCase() === ZERO_ADDRESS) {
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
    debug("Ownership analysis failed:", error);
    return {
      safe: false,
      risk: "UNKNOWN",
      message: "Contract may not implement owner() or check failed",
      scoreImpact: 1,
    };
  }
}
