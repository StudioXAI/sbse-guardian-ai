import axios from "axios";

const KNOWN_LOCKERS = [
  "pinklock",
  "unicrypt",
  "teamfinance",
  "locker",
  "lock",
  "vesting",
  "burn",
  "dead",
];

export async function checkLiquidityLock(
  contractAddress: string
) {
  try {
    console.log(
      "Checking liquidity lock for:",
      contractAddress
    );

    /**
     * Placeholder Phase 1
     * We start with heuristic detection first,
     * then upgrade to full LP tracker.
     */

    const apiKey = process.env.ETHERSCAN_API_KEY;

    const url = `https://api.etherscan.io/api?module=contract&action=getsourcecode&address=${contractAddress}&apikey=${apiKey}`;

    const response = await axios.get(url);
    const sourceCode =
      response.data?.result?.[0]?.SourceCode?.toLowerCase() || "";

    let findings: string[] = [];
    let risky = false;
    let locked = false;

    for (const keyword of KNOWN_LOCKERS) {
      if (sourceCode.includes(keyword)) {
        findings.push(
          `Liquidity lock signal detected: ${keyword}`
        );
        locked = true;
      }
    }

    if (
      sourceCode.includes("removeliquidity") ||
      sourceCode.includes("withdrawliquidity")
    ) {
      findings.push(
        "Owner can remove liquidity"
      );
      risky = true;
    }

    if (!locked) {
      findings.push(
        "No liquidity lock verification detected"
      );
      risky = true;
    }

    return {
      locked,
      risky,
      findings,
    };
  } catch (error) {
    console.error(
      "Liquidity lock check failed:",
      error
    );

    return {
      locked: false,
      risky: true,
      findings: [
        "Liquidity analysis unavailable",
      ],
    };
  }
}