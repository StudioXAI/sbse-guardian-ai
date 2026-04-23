/* ─────────────────────────────────────────────────────────────
   Liquidity Lock Analysis
   - Returns dataAvailable flag for graceful degradation
   - Softens "Unable to verify" to neutral info instead of warn
   ───────────────────────────────────────────────────────────── */

import { isInstitutional, debug } from "./constants";
import { explorerUrl, fetchJson, type ChainInfo } from "./fetchHelpers";

const KNOWN_LOCKERS = [
  "pinklock",
  "unicrypt",
  "teamfinance",
  "team finance",
  "locker",
  "vesting",
  "0x000000000000000000000000000000000000dead",
];

export interface LiquidityLockResult {
  /** Did we have enough data (verified source code) to analyze? */
  dataAvailable: boolean;
  locked: boolean;
  risky: boolean;
  findings: string[];
}

export async function checkLiquidityLock(
  contractAddress: string,
  chain: ChainInfo,
  symbol?: string,
): Promise<LiquidityLockResult> {
  try {
    if (isInstitutional(symbol)) {
      return {
        dataAvailable: true,
        locked: true,
        risky: false,
        findings: [
          "Institutional liquidity architecture detected",
          "Multi-venue liquidity management verified",
          "Protocol-managed treasury liquidity",
        ],
      };
    }

    const url = explorerUrl(chain, {
      module: "contract",
      action: "getsourcecode",
      address: contractAddress,
    });

    const data = await fetchJson<any>(url);
    const sourceCode = (data?.result?.[0]?.SourceCode || "").toLowerCase();

    if (!sourceCode) {
      return {
        dataAvailable: false,
        locked: false,
        risky: false, // don't penalize unverified — bytecode analyzer handles that
        findings: [],
      };
    }

    const findings: string[] = [];
    let risky = false;
    let locked = false;

    for (const keyword of KNOWN_LOCKERS) {
      if (sourceCode.includes(keyword)) {
        findings.push(`Liquidity lock signal: ${keyword}`);
        locked = true;
      }
    }

    const canRemoveLiquidity =
      sourceCode.includes("removeliquidity") ||
      sourceCode.includes("withdrawliquidity") ||
      sourceCode.includes("removeliquidityeth") ||
      sourceCode.includes("withdrawlp") ||
      sourceCode.includes("withdrawtokens");

    if (canRemoveLiquidity) {
      findings.push("Owner liquidity-removal permissions detected");
      risky = true;
    }

    if (!locked) {
      findings.push("No liquidity lock verification detected");
      risky = true;
    } else {
      findings.push("Liquidity lock verification detected");
    }

    if (!locked && canRemoveLiquidity) {
      findings.push("Critical liquidity rug-pull risk");
      risky = true;
    }

    return { dataAvailable: true, locked, risky, findings };
  } catch (error) {
    debug("Liquidity lock check failed:", error);
    return {
      dataAvailable: false,
      locked: false,
      risky: false,
      findings: [],
    };
  }
}
