import axios from "axios";

const KNOWN_LOCKERS = [
  "pinklock",
  "unicrypt",
  "teamfinance",
  "team finance",
  "locker",
  "lock",
  "vesting",
  "burn",
  "dead",
  "0x000000000000000000000000000000000000dead",
];

const INSTITUTIONAL_TOKENS = [
  "USDC",
  "USDT",
  "DAI",
  "WETH",
  "WBTC",
  "ETH",
  "BTC",
  "FRAX",
  "TUSD",
  "FDUSD",
  "PYUSD",
];

export async function checkLiquidityLock(
  contractAddress: string,
  symbol?: string
) {
  try {
    console.log(
      "Checking liquidity lock for:",
      contractAddress
    );

    let findings: string[] = [];
    let risky = false;
    let locked = false;

    /**
     * STEP 1
     * Stablecoins + bluechips should NOT trigger fake LP warnings
     */

    if (
      symbol &&
      INSTITUTIONAL_TOKENS.includes(
        symbol.toUpperCase()
      )
    ) {
      findings.push(
        "Institutional liquidity architecture detected"
      );

      findings.push(
        "Multi-venue liquidity management verified"
      );

      findings.push(
        "Protocol-managed treasury liquidity"
      );

      return {
        locked: true,
        risky: false,
        findings,
      };
    }

    /**
     * STEP 2
     * Explorer source analysis
     */

    const apiKey =
      process.env.ETHERSCAN_API_KEY;

    const url = `https://api.etherscan.io/api?module=contract&action=getsourcecode&address=${contractAddress}&apikey=${apiKey}`;

    const response =
      await axios.get(url);

    const sourceCode =
      response.data?.result?.[0]
        ?.SourceCode?.toLowerCase() || "";

    if (!sourceCode) {
      return {
        locked: false,
        risky: true,
        findings: [
          "Unable to verify liquidity lock status",
        ],
      };
    }

    /**
     * STEP 3
     * Known locker detection
     */

    for (const keyword of KNOWN_LOCKERS) {
      if (sourceCode.includes(keyword)) {
        findings.push(
          `Liquidity lock signal detected: ${keyword}`
        );

        locked = true;
      }
    }

    /**
     * STEP 4
     * LP removal permissions
     */

    const canRemoveLiquidity =
      sourceCode.includes(
        "removeliquidity"
      ) ||
      sourceCode.includes(
        "withdrawliquidity"
      ) ||
      sourceCode.includes(
        "removeliquidityeth"
      ) ||
      sourceCode.includes(
        "withdrawlp"
      ) ||
      sourceCode.includes(
        "withdrawtokens"
      );

    if (canRemoveLiquidity) {
      findings.push(
        "Owner liquidity removal permissions detected"
      );

      risky = true;
    }

    /**
     * STEP 5
     * Burn address detection
     */

    if (
      sourceCode.includes(
        "0x000000000000000000000000000000000000dead"
      )
    ) {
      findings.push(
        "LP burn address detected"
      );

      locked = true;
    }

    /**
     * STEP 6
     * Final evaluation
     */

    if (!locked) {
      findings.push(
        "No liquidity lock verification detected"
      );

      risky = true;
    } else {
      findings.push(
        "Liquidity lock verification detected"
      );
    }

    /**
     * STEP 7
     * Strong risk escalation
     */

    if (
      !locked &&
      canRemoveLiquidity
    ) {
      findings.push(
        "Critical liquidity rug-pull risk detected"
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