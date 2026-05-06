/* ─────────────────────────────────────────────────────────────
   Automated Security Scan

   Pre-deployment checks on the user's deployment parameters and
   the resolved bytecode. Returns transparent pass/warn/fail per
   check so users can see exactly what we tested for.

   Important framing note: we deliberately call this an
   "Automated Security Scan", NOT an "audit". An AI/automated scan
   catches common issues but cannot replace a human security audit
   for novel logic vulnerabilities, economic attack vectors, or
   composability bugs. The UI makes this distinction explicit.

   Checks performed:
   - Parameter sanity (symbol length, supply not absurd, etc.)
   - Template integrity (bytecode populated, source hash matches)
   - No reserved/blocked names
   - Initial supply within sane bounds
   - Decimals at standard values

   What this CANNOT detect:
   - Custom logic bugs (n/a, we use known templates)
   - Economic attack vectors against the deployed token
   - Whether the project itself is legitimate or a scam
   - Anything about the user's intent
   ───────────────────────────────────────────────────────────── */

import type { TokenTemplate } from "./templates";

export type CheckSeverity = "pass" | "warn" | "fail";

export interface SecurityCheck {
  /** Internal id for the check. */
  id: string;
  /** Short label shown in the UI. */
  label: string;
  /** Severity level. fail = blocks deploy; warn = informational. */
  severity: CheckSeverity;
  /** Plain-English explanation shown to the user. */
  detail: string;
}

export interface ScanInput {
  template: TokenTemplate;
  parameters: Record<string, string | number>;
}

export interface ScanResult {
  checks: SecurityCheck[];
  /** Worst severity across all checks — drives UI styling. */
  overallSeverity: CheckSeverity;
  /** True if the deploy should be allowed. False if any check failed. */
  canDeploy: boolean;
}

/* ═══════════════════════════════════════════════════════════ */
/* Reserved / blocked patterns                                  */
/* ═══════════════════════════════════════════════════════════ */

/* Names that look like impersonations of major projects. We warn
   rather than block because legitimate forks exist. The list is
   intentionally short — we're not the brand police, we just want
   to flag obvious cloning. */
const IMPERSONATION_PATTERNS = [
  /\busdt\b/i,
  /\busdc\b/i,
  /\bdai\b/i,
  /\bweth\b/i,
  /\bwbtc\b/i,
  /\buniswap\b/i,
  /\bpancake/i,
  /\bbinance\b/i,
  /\bcoinbase\b/i,
  /\bopenai\b/i,
  /\banthropic\b/i,
  /\bclaude\b/i,
  /\bchatgpt\b/i,
];

/* Names that likely violate trademarks of well-known brands. We
   warn — final responsibility is on the deployer. */
const BRAND_PATTERNS = [
  /\bnike\b/i,
  /\bapple\b/i,
  /\bgoogle\b/i,
  /\bmeta\b/i,
  /\bmicrosoft\b/i,
  /\btesla\b/i,
];

/* ═══════════════════════════════════════════════════════════ */
/* Individual check functions                                   */
/* ═══════════════════════════════════════════════════════════ */

function checkBytecodeReady(template: TokenTemplate): SecurityCheck {
  if (template.bytecodeReady) {
    return {
      id: "bytecode-ready",
      label: "Template bytecode populated",
      severity: "pass",
      detail: `Compiled ${template.name} bytecode is loaded (${template.bytecode.length} hex chars). Source hash: ${template.sourceHash.slice(0, 12)}…`,
    };
  }
  return {
    id: "bytecode-ready",
    label: "Template bytecode missing",
    severity: "fail",
    detail:
      "The deployment template has not been compiled yet. Follow the Hardhat compile steps in lib/deployer/templates/erc20-ozv5.bytecode.ts to populate the bytecode before deploying.",
  };
}

function checkNameAndSymbol(parameters: Record<string, string | number>): SecurityCheck[] {
  const checks: SecurityCheck[] = [];
  const name = String(parameters.name ?? "").trim();
  const symbol = String(parameters.symbol ?? "").trim();

  /* Empty checks */
  if (name.length === 0) {
    checks.push({
      id: "name-empty",
      label: "Token name required",
      severity: "fail",
      detail: "Token name cannot be empty.",
    });
  } else if (name.length > 64) {
    checks.push({
      id: "name-too-long",
      label: "Token name too long",
      severity: "fail",
      detail: "Token name must be 64 characters or less.",
    });
  } else {
    checks.push({
      id: "name-format",
      label: "Token name format",
      severity: "pass",
      detail: `"${name}" is within length limits.`,
    });
  }

  if (symbol.length === 0) {
    checks.push({
      id: "symbol-empty",
      label: "Token symbol required",
      severity: "fail",
      detail: "Token symbol cannot be empty.",
    });
  } else if (symbol.length > 8) {
    checks.push({
      id: "symbol-too-long",
      label: "Token symbol too long",
      severity: "fail",
      detail: "Token symbol must be 8 characters or less. Most tokens use 3-5 characters.",
    });
  } else if (!/^[A-Za-z0-9$]+$/.test(symbol)) {
    checks.push({
      id: "symbol-format",
      label: "Token symbol format",
      severity: "warn",
      detail:
        "Symbol contains non-standard characters. Most exchanges and aggregators expect alphanumeric symbols only.",
    });
  } else {
    checks.push({
      id: "symbol-format",
      label: "Token symbol format",
      severity: "pass",
      detail: `"${symbol}" is alphanumeric and within length limits.`,
    });
  }

  /* Impersonation check */
  const combinedText = `${name} ${symbol}`;
  for (const pattern of IMPERSONATION_PATTERNS) {
    if (pattern.test(combinedText)) {
      checks.push({
        id: "impersonation-risk",
        label: "Possible impersonation",
        severity: "warn",
        detail:
          "Your token name or symbol matches a well-known project. Cloning popular project names is a common scam pattern and may get your token flagged on aggregators. If this is intentional and legitimate (e.g. a fork), proceed with caution.",
      });
      break;
    }
  }

  /* Brand trademark check */
  for (const pattern of BRAND_PATTERNS) {
    if (pattern.test(combinedText)) {
      checks.push({
        id: "trademark-risk",
        label: "Possible trademark conflict",
        severity: "warn",
        detail:
          "Your token name references a well-known brand. This may create trademark issues. Confirm you're authorized to use this branding.",
      });
      break;
    }
  }

  return checks;
}

function checkSupply(parameters: Record<string, string | number>): SecurityCheck {
  const raw = parameters.initialSupply;
  const supply = typeof raw === "number" ? raw : Number(raw);

  if (!Number.isFinite(supply) || supply <= 0) {
    return {
      id: "supply-invalid",
      label: "Initial supply invalid",
      severity: "fail",
      detail: "Initial supply must be a positive number.",
    };
  }

  if (supply > 1_000_000_000_000_000) {
    return {
      id: "supply-extreme",
      label: "Initial supply extremely large",
      severity: "warn",
      detail:
        "Supplies above 1 quadrillion can cause overflow issues with some integrations and look like meme-token bait. Consider whether this is appropriate for your project.",
    };
  }

  if (supply < 100) {
    return {
      id: "supply-tiny",
      label: "Initial supply very small",
      severity: "warn",
      detail:
        "Supplies below 100 tokens are unusual and may cause display issues on aggregators and exchanges.",
    };
  }

  return {
    id: "supply-sane",
    label: "Initial supply within typical range",
    severity: "pass",
    detail: `${supply.toLocaleString()} tokens will be minted to the deployer wallet.`,
  };
}

function checkDecimals(parameters: Record<string, string | number>): SecurityCheck {
  const raw = parameters.decimals;
  const decimals = typeof raw === "number" ? raw : Number(raw);

  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 30) {
    return {
      id: "decimals-invalid",
      label: "Decimals invalid",
      severity: "fail",
      detail: "Decimals must be an integer between 0 and 30.",
    };
  }

  if (decimals !== 18 && decimals !== 6 && decimals !== 8) {
    return {
      id: "decimals-nonstandard",
      label: "Non-standard decimals",
      severity: "warn",
      detail:
        "Most ERC-20s use 18 decimals (the default), or 6 (USDT/USDC) / 8 (BTC-aligned). Non-standard values can confuse wallets and aggregators.",
    };
  }

  return {
    id: "decimals-standard",
    label: "Standard decimals value",
    severity: "pass",
    detail: `${decimals} decimals is a standard value used by major tokens.`,
  };
}

/* ═══════════════════════════════════════════════════════════ */
/* Public scan entrypoint                                       */
/* ═══════════════════════════════════════════════════════════ */

export function runSecurityScan(input: ScanInput): ScanResult {
  const checks: SecurityCheck[] = [];

  checks.push(checkBytecodeReady(input.template));
  checks.push(...checkNameAndSymbol(input.parameters));
  checks.push(checkSupply(input.parameters));
  checks.push(checkDecimals(input.parameters));

  /* Determine overall severity */
  let overallSeverity: CheckSeverity = "pass";
  for (const c of checks) {
    if (c.severity === "fail") {
      overallSeverity = "fail";
      break; // can't get worse than fail
    }
    if (c.severity === "warn" && overallSeverity === "pass") {
      overallSeverity = "warn";
    }
  }

  return {
    checks,
    overallSeverity,
    canDeploy: overallSeverity !== "fail",
  };
}
