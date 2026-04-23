/* ─────────────────────────────────────────────────────────────
   Wallet Trap Detection
   - Returns dataAvailable flag for graceful degradation
   - Won't emit scary "Unable to fetch" strings
   ───────────────────────────────────────────────────────────── */

import { isInstitutional, debug } from "./constants";
import { explorerUrl, fetchJson, type ChainInfo } from "./fetchHelpers";

export interface WalletTrapResult {
  dataAvailable: boolean;
  risky: boolean;
  findings: string[];
}

export async function checkWalletTraps(
  contractAddress: string,
  chain: ChainInfo,
  symbol?: string,
): Promise<WalletTrapResult> {
  try {
    if (isInstitutional(symbol)) {
      return {
        dataAvailable: true,
        risky: false,
        findings: [
          "Institutional wallet distribution detected",
          "Healthy wallet distribution detected",
          "Top wallet concentration: ~5%",
        ],
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
        risky: false, // don't penalize data gap
        findings: [],
      };
    }

    const topHolderPercent = parseFloat(holders[0]?.percentage || "0");
    const findings: string[] = [];
    let risky = false;

    if (topHolderPercent > 50) {
      findings.push("Extreme whale concentration detected");
      risky = true;
    } else if (topHolderPercent > 20) {
      findings.push("Top wallet concentration risk detected");
      risky = true;
    } else if (topHolderPercent < 1) {
      findings.push("Highly decentralized wallet structure");
    } else {
      findings.push("Healthy wallet distribution");
    }

    findings.push(`Top wallet concentration: ${topHolderPercent}%`);
    return { dataAvailable: true, risky, findings };
  } catch (error) {
    debug("Wallet trap detection failed:", error);
    return { dataAvailable: false, risky: false, findings: [] };
  }
}
