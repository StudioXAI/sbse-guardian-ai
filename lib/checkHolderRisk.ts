/* ─────────────────────────────────────────────────────────────
   Holder Risk Analysis
   - Returns a dataAvailable flag so the route can suppress misleading
     "top holder 0%" messages when holder data couldn't be fetched.
   - No longer renders scary "Unable to fetch" strings — those are
     data gaps, not findings.
   ───────────────────────────────────────────────────────────── */

import { isInstitutional, debug } from "./constants";
import { explorerUrl, fetchJson, type ChainInfo } from "./fetchHelpers";

export interface HolderRiskResult {
  /** Did we successfully fetch holder data? */
  dataAvailable: boolean;
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
        dataAvailable: true,
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
        dataAvailable: false,
        risky: false, // don't penalize for data unavailable
        topHolderPercent: 0,
        message: "Holder data not indexed on this chain",
      };
    }

    const topHolderPercent = Number(holders[0]?.percentage || 0);

    if (topHolderPercent >= 50)
      return { dataAvailable: true, risky: true, topHolderPercent, message: "Critical whale concentration" };
    if (topHolderPercent >= 25)
      return { dataAvailable: true, risky: true, topHolderPercent, message: "High holder concentration" };
    if (topHolderPercent >= 10)
      return { dataAvailable: true, risky: false, topHolderPercent, message: "Moderate holder concentration" };
    return { dataAvailable: true, risky: false, topHolderPercent, message: "Healthy decentralized distribution" };
  } catch (error) {
    debug("Holder analysis failed:", error);
    return {
      dataAvailable: false,
      risky: false,
      topHolderPercent: 0,
      message: "Holder data not indexed on this chain",
    };
  }
}
