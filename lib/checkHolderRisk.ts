/* ─────────────────────────────────────────────────────────────
   Holder Risk Analysis
   - ChainInfo-aware: no more hardcoded etherscan.io
   - Shared INSTITUTIONAL_TOKENS via isInstitutional()
   - Native fetch with timeout
   ───────────────────────────────────────────────────────────── */

import { isInstitutional, debug } from "./constants";
import { explorerUrl, fetchJson, type ChainInfo } from "./fetchHelpers";

export interface HolderRiskResult {
  risky: boolean;
  topHolderPercent: number;
  message: string;
}

export async function checkHolderRisk(
  contractAddress: string,
  chain: ChainInfo,
  symbol?: string,
): Promise<HolderRiskResult> {
  try {
    if (isInstitutional(symbol)) {
      return {
        risky: false,
        topHolderPercent: 5,
        message: "Institutional holder structure detected",
      };
    }

    const url = explorerUrl(chain, {
      module: "token",
      action: "tokenholderlist",
      contractaddress: contractAddress,
      page: "1",
      offset: "10",
    });

    const data = await fetchJson<any>(url);
    const holders = Array.isArray(data?.result) ? data.result : [];

    if (!holders.length) {
      return {
        risky: true,
        topHolderPercent: 0,
        message: "Unable to fetch holder concentration data",
      };
    }

    const topHolderPercent = Number(holders[0]?.percentage || 0);

    if (topHolderPercent >= 50)
      return { risky: true, topHolderPercent, message: "Critical whale concentration" };
    if (topHolderPercent >= 25)
      return { risky: true, topHolderPercent, message: "High holder concentration" };
    if (topHolderPercent >= 10)
      return { risky: false, topHolderPercent, message: "Moderate holder concentration" };
    return { risky: false, topHolderPercent, message: "Healthy decentralized distribution" };
  } catch (error) {
    debug("Holder analysis failed:", error);
    return { risky: true, topHolderPercent: 0, message: "Holder analysis unavailable" };
  }
}
