/* ─────────────────────────────────────────────────────────────
   Dangerous function selectors
   Maps the first 4 bytes of an EVM transaction's input data to
   the function name and a severity score (0-100).

   The selector is keccak256(signature)[0:4]. We use this to detect
   when wallets call risky functions on tracked token contracts.
   ───────────────────────────────────────────────────────────── */

export type RiskSeverity = "critical" | "high" | "medium" | "low";

export interface RiskFunction {
  selector: string;
  signature: string;
  shortName: string;
  severity: RiskSeverity;
  /** What does this function do, in plain English. */
  description: string;
}

/* Selectors are pre-lowercased and prefixed with "0x". */
export const RISK_FUNCTIONS: Record<string, RiskFunction> = {
  /* ═══ CRITICAL — direct rug-pull tooling ═══ */
  "0x40c10f19": {
    selector: "0x40c10f19",
    signature: "mint(address,uint256)",
    shortName: "mint",
    severity: "critical",
    description: "Creates new tokens. Used in inflation attacks and supply rugs.",
  },
  "0xa0712d68": {
    selector: "0xa0712d68",
    signature: "mint(uint256)",
    shortName: "mint",
    severity: "critical",
    description: "Creates new tokens (variant). Used in inflation attacks.",
  },
  "0xf2fde38b": {
    selector: "0xf2fde38b",
    signature: "transferOwnership(address)",
    shortName: "transferOwnership",
    severity: "critical",
    description: "Transfers contract ownership to a new address.",
  },
  "0x715018a6": {
    selector: "0x715018a6",
    signature: "renounceOwnership()",
    shortName: "renounceOwnership",
    severity: "high",
    description: "Removes the owner — usually intended as a trust signal but can lock in malicious settings.",
  },
  "0x3659cfe6": {
    selector: "0x3659cfe6",
    signature: "upgradeTo(address)",
    shortName: "upgradeTo",
    severity: "critical",
    description: "Upgrades a proxy contract's implementation. Replaces all logic.",
  },
  "0x4f1ef286": {
    selector: "0x4f1ef286",
    signature: "upgradeToAndCall(address,bytes)",
    shortName: "upgradeToAndCall",
    severity: "critical",
    description: "Upgrades the proxy and calls a function on the new implementation.",
  },
  "0xf6e76e1c": {
    selector: "0xf6e76e1c",
    signature: "emergencyWithdraw()",
    shortName: "emergencyWithdraw",
    severity: "critical",
    description: "Bypasses normal withdraw checks. Used in pre-rug exits.",
  },

  /* ═══ HIGH — reachable from compromise paths ═══ */
  "0xf9f92be4": {
    selector: "0xf9f92be4",
    signature: "blacklist(address)",
    shortName: "blacklist",
    severity: "high",
    description: "Prevents an address from transferring tokens. Censorship vector.",
  },
  "0xafa4f3b2": {
    selector: "0xafa4f3b2",
    signature: "excludeFromFee(address)",
    shortName: "excludeFromFee",
    severity: "high",
    description: "Removes tax/fee from a wallet. Used to set up insider exits.",
  },
  "0xc0d78655": {
    selector: "0xc0d78655",
    signature: "setRouter(address)",
    shortName: "setRouter",
    severity: "high",
    description: "Changes which DEX router the contract trusts.",
  },
  "0x29b6eca9": {
    selector: "0x29b6eca9",
    signature: "setSwapEnabled(bool)",
    shortName: "setSwapEnabled",
    severity: "high",
    description: "Enables/disables trading. Used to freeze sells while owner exits.",
  },
  "0x8456cb59": {
    selector: "0x8456cb59",
    signature: "pause()",
    shortName: "pause",
    severity: "high",
    description: "Pauses all token transfers contract-wide.",
  },
  "0x3f4ba83a": {
    selector: "0x3f4ba83a",
    signature: "unpause()",
    shortName: "unpause",
    severity: "low",
    description: "Resumes transfers after a pause.",
  },

  /* ═══ MEDIUM — common in legitimate ops, but worth flagging ═══ */
  "0x53d6fd59": {
    selector: "0x53d6fd59",
    signature: "setTax(uint256)",
    shortName: "setTax",
    severity: "medium",
    description: "Changes the transfer tax rate. Sometimes raised before exit.",
  },
  "0xd2b572a3": {
    selector: "0xd2b572a3",
    signature: "setFees(uint256,uint256)",
    shortName: "setFees",
    severity: "medium",
    description: "Adjusts buy/sell fees on the token.",
  },

  /* ═══ LIQUIDITY OPS — high impact when called by anyone ═══ */
  "0xbaa2abde": {
    selector: "0xbaa2abde",
    signature: "removeLiquidity(address,address,uint256,uint256,uint256,address,uint256)",
    shortName: "removeLiquidity",
    severity: "critical",
    description: "Withdraws liquidity from a Uniswap V2-style pool. Pre-rug signature when called by deployer.",
  },
  "0x02751cec": {
    selector: "0x02751cec",
    signature: "removeLiquidityETH(address,uint256,uint256,uint256,address,uint256)",
    shortName: "removeLiquidityETH",
    severity: "critical",
    description: "Withdraws liquidity (ETH variant). Same risk profile as removeLiquidity.",
  },
  "0x5b0d5984": {
    selector: "0x5b0d5984",
    signature: "removeLiquidityWithPermit(address,address,uint256,uint256,uint256,address,uint256,bool,uint8,bytes32,bytes32)",
    shortName: "removeLiquidityWithPermit",
    severity: "critical",
    description: "Withdraws liquidity using a permit signature. Bypasses approval check.",
  },
};

/**
 * Decode a transaction's input data and return the matching risk
 * function, or null if it's not a known risky call.
 */
export function decodeRiskFunction(input: string | undefined): RiskFunction | null {
  if (!input || input.length < 10) return null;
  const selector = input.slice(0, 10).toLowerCase();
  return RISK_FUNCTIONS[selector] ?? null;
}

/** Return numeric weight for sorting/severity totals. */
export function severityWeight(s: RiskSeverity): number {
  switch (s) {
    case "critical":
      return 100;
    case "high":
      return 60;
    case "medium":
      return 30;
    case "low":
      return 10;
  }
}
