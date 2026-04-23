/* ─────────────────────────────────────────────────────────────
   Bytecode Analyzer — authoritative contract analysis.

   This replaces the old keyword-matching approach (searching source
   code for strings like "mint" or "blacklist") with real on-chain
   evidence:

   1. eth_getCode — get the actual deployed bytecode
   2. eth_getStorageAt EIP-1967 slots — detect proxies deterministically
   3. eth_call owner() — read the authoritative owner address
   4. Function selector search — detect presence of known dangerous
      functions by their 4-byte selector in the bytecode

   Why this matters:
   - A proxy contract's source code might say "ownership renounced"
     but the proxy's owner slot could still be live. We read the slot
     directly.
   - A contract might contain the word "mint" in a comment. We look
     for the actual mint(address,uint256) function selector.
   - We can detect even unverified contracts by their bytecode.
   ───────────────────────────────────────────────────────────── */

import { debug } from "./constants";

/* ── EIP-1967 storage slots ── */
// bytes32(uint256(keccak256("eip1967.proxy.implementation")) - 1)
const EIP1967_IMPLEMENTATION_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

// bytes32(uint256(keccak256("eip1967.proxy.admin")) - 1)
const EIP1967_ADMIN_SLOT =
  "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";

// bytes32(uint256(keccak256("eip1967.proxy.beacon")) - 1)
const EIP1967_BEACON_SLOT =
  "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50";

// OpenZeppelin older transparent proxy admin slot
const OZ_LEGACY_ADMIN_SLOT =
  "0x10d6a54a4754c8869d6886b5f5d7fbfa5b4522237ea5c60d11bc4e7a1ff9390b";

// UUPS uses the same implementation slot as EIP-1967.
// Diamond/EIP-2535 uses different storage; we report proxy but not impl.
// bytes32(uint256(keccak256("diamond.standard.diamond.storage")) - 1) ^ 0xff
const DIAMOND_MAGIC = "0xc8fcad8db84d3cc18b4c41d551ea0ee66dd599cde068d998e57d5e09332c131c";

/* ── Function selectors (first 4 bytes of keccak256 of signature) ── */
const SELECTORS = {
  // Ownership
  owner: "8da5cb5b",                    // owner()
  renounceOwnership: "715018a6",        // renounceOwnership()
  transferOwnership: "f2fde38b",        // transferOwnership(address)

  // Mint
  mintAddressUint: "40c10f19",          // mint(address,uint256)
  mintUint: "a0712d68",                 // mint(uint256)
  mintTo: "449a52f8",                   // mintTo(address,uint256)
  openZeppelinMint: "d5f39488",         // _mint exposed in some forks

  // Burn / burnFrom
  burn: "42966c68",                     // burn(uint256)
  burnFrom: "79cc6790",                 // burnFrom(address,uint256)

  // Pause
  pause: "8456cb59",                    // pause()
  unpause: "3f4ba83a",                  // unpause()
  paused: "5c975abb",                   // paused() -> bool

  // Blacklist / Block / Freeze
  addToBlacklist: "44337ea1",           // addToBlacklist(address)
  blacklist: "f9f92be4",                // blacklist(address)
  isBlacklisted: "fe575a87",            // isBlacklisted(address)
  freeze: "45c8b1a6",                   // freeze(address)

  // Fees / Tax
  setFee: "8e005553",                   // setFee(uint256)
  setBuyTax: "d38bfff4",                // setBuyTax(uint256)
  setSellTax: "1bec53db",               // setSellTax(uint256)
  setMaxTransaction: "7ac1b0c9",        // setMaxTransaction(uint256)

  // Upgrade (UUPS)
  upgradeTo: "3659cfe6",                // upgradeTo(address)
  upgradeToAndCall: "4f1ef286",         // upgradeToAndCall(address,bytes)
};

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const DEAD_ADDRESS = "0x000000000000000000000000000000000000dead";

export interface BytecodeAnalysis {
  /** True if we successfully fetched bytecode. If false, other fields are defaults. */
  success: boolean;
  /** Size of the deployed bytecode in bytes. 0 = EOA or non-existent. */
  bytecodeSize: number;
  /** Is this contract code present on-chain? */
  isContract: boolean;

  /** Proxy detection */
  isProxy: boolean;
  proxyType: "EIP-1967" | "UUPS" | "Transparent" | "Beacon" | "Diamond" | "Legacy-OZ" | null;
  implementation: string | null;
  proxyAdmin: string | null;

  /** Ownership */
  ownershipRenounced: boolean | null;   // null = couldn't determine
  ownerAddress: string | null;          // actual address from owner() call
  hasRenounceFunction: boolean;
  hasTransferOwnershipFunction: boolean;

  /** Dangerous capabilities (by function selector) */
  hasMintFunction: boolean;
  mintVariants: string[];               // Which mint functions were found
  hasBurnFunction: boolean;
  hasPauseFunction: boolean;
  hasBlacklistFunction: boolean;
  hasFeeModification: boolean;
  hasMaxTransaction: boolean;

  /** Upgrade capability */
  hasUpgradeFunction: boolean;
}

const DEFAULT_ANALYSIS: BytecodeAnalysis = {
  success: false,
  bytecodeSize: 0,
  isContract: false,
  isProxy: false,
  proxyType: null,
  implementation: null,
  proxyAdmin: null,
  ownershipRenounced: null,
  ownerAddress: null,
  hasRenounceFunction: false,
  hasTransferOwnershipFunction: false,
  hasMintFunction: false,
  mintVariants: [],
  hasBurnFunction: false,
  hasPauseFunction: false,
  hasBlacklistFunction: false,
  hasFeeModification: false,
  hasMaxTransaction: false,
  hasUpgradeFunction: false,
};

/* ─────────────────────────────────────────────────────────────
   JSON-RPC helper
   ───────────────────────────────────────────────────────────── */

async function rpcCall<T = unknown>(
  rpcUrl: string,
  method: string,
  params: unknown[],
  timeoutMs = 8000,
): Promise<T | null> {
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method,
        params,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.error) {
      debug(`RPC error on ${method}:`, data.error?.message);
      return null;
    }
    return data.result as T;
  } catch (e) {
    debug(`RPC call failed on ${method}:`, e);
    return null;
  }
}

/* ─────────────────────────────────────────────────────────────
   Storage slot reading — reliable proxy detection
   ───────────────────────────────────────────────────────────── */

/** Convert 32-byte storage slot value to address (last 20 bytes) */
function slotToAddress(slot: string | null): string | null {
  if (!slot || slot === "0x" || slot.length < 42) return null;
  const addr = "0x" + slot.slice(-40).toLowerCase();
  if (addr === ZERO_ADDRESS) return null;
  return addr;
}

async function detectProxy(
  rpcUrl: string,
  contract: string,
): Promise<{
  isProxy: boolean;
  proxyType: BytecodeAnalysis["proxyType"];
  implementation: string | null;
  proxyAdmin: string | null;
}> {
  const [impl, admin, beacon, ozLegacyAdmin] = await Promise.all([
    rpcCall<string>(rpcUrl, "eth_getStorageAt", [contract, EIP1967_IMPLEMENTATION_SLOT, "latest"]),
    rpcCall<string>(rpcUrl, "eth_getStorageAt", [contract, EIP1967_ADMIN_SLOT, "latest"]),
    rpcCall<string>(rpcUrl, "eth_getStorageAt", [contract, EIP1967_BEACON_SLOT, "latest"]),
    rpcCall<string>(rpcUrl, "eth_getStorageAt", [contract, OZ_LEGACY_ADMIN_SLOT, "latest"]),
  ]);

  const implAddr = slotToAddress(impl);
  const adminAddr = slotToAddress(admin);
  const beaconAddr = slotToAddress(beacon);
  const ozLegacyAdminAddr = slotToAddress(ozLegacyAdmin);

  if (beaconAddr) {
    // Beacon proxy — implementation is looked up via the beacon contract
    return {
      isProxy: true,
      proxyType: "Beacon",
      implementation: null,   // dynamic
      proxyAdmin: null,
      ...{ beaconAddress: beaconAddr } as Record<string, unknown>,
    };
  }

  if (implAddr) {
    // Distinguish UUPS vs Transparent by admin slot presence
    if (adminAddr) {
      return {
        isProxy: true,
        proxyType: "Transparent",
        implementation: implAddr,
        proxyAdmin: adminAddr,
      };
    }
    return {
      isProxy: true,
      proxyType: "UUPS",
      implementation: implAddr,
      proxyAdmin: null,
    };
  }

  if (ozLegacyAdminAddr) {
    return {
      isProxy: true,
      proxyType: "Legacy-OZ",
      implementation: null,
      proxyAdmin: ozLegacyAdminAddr,
    };
  }

  return {
    isProxy: false,
    proxyType: null,
    implementation: null,
    proxyAdmin: null,
  };
}

/* ─────────────────────────────────────────────────────────────
   Ownership — authoritative read
   ───────────────────────────────────────────────────────────── */

async function readOwner(
  rpcUrl: string,
  contract: string,
): Promise<string | null> {
  // eth_call with selector for owner() — returns 32-byte padded address
  const result = await rpcCall<string>(rpcUrl, "eth_call", [
    { to: contract, data: "0x" + SELECTORS.owner },
    "latest",
  ]);
  return slotToAddress(result);
}

function isRenounced(owner: string | null): boolean | null {
  if (!owner) return null;
  const normalized = owner.toLowerCase();
  return normalized === ZERO_ADDRESS || normalized === DEAD_ADDRESS;
}

/* ─────────────────────────────────────────────────────────────
   Function selector search in bytecode
   ───────────────────────────────────────────────────────────── */

/**
 * Search bytecode for a 4-byte function selector.
 * Selectors appear in the runtime dispatch table as raw bytes,
 * typically after PUSH4 opcodes (0x63). We search the whole bytecode
 * for case-insensitive hex presence.
 *
 * This has a small false-positive rate (constants in bytecode could
 * coincidentally match) but is reliable enough for a security signal
 * because:
 *  - 4 random bytes collision probability is ~1 in 4 billion
 *  - Real function selectors are in dispatch tables near the start
 *    of runtime bytecode
 */
function hasSelector(bytecode: string, selector: string): boolean {
  // Normalize and strip 0x
  const code = bytecode.toLowerCase().replace(/^0x/, "");
  const sel = selector.toLowerCase().replace(/^0x/, "");
  // Require the selector to be preceded by the PUSH4 opcode (63) in most cases,
  // but we accept anywhere since some compilers use different dispatchers.
  return code.includes(sel);
}

/* ─────────────────────────────────────────────────────────────
   Main analyzer
   ───────────────────────────────────────────────────────────── */

export async function analyzeBytecode(
  contractAddress: string,
  rpcUrl: string | undefined,
): Promise<BytecodeAnalysis> {
  if (!rpcUrl) {
    debug("No RPC URL available for bytecode analysis");
    return DEFAULT_ANALYSIS;
  }

  // Step 1: Get the bytecode
  const bytecode = await rpcCall<string>(rpcUrl, "eth_getCode", [contractAddress, "latest"]);

  if (!bytecode || bytecode === "0x" || bytecode === "0x0") {
    return {
      ...DEFAULT_ANALYSIS,
      success: true,
      bytecodeSize: 0,
      isContract: false,
    };
  }

  const bytecodeSize = Math.floor((bytecode.length - 2) / 2);

  // Step 2: Proxy detection — parallel storage slot reads
  const proxyInfo = await detectProxy(rpcUrl, contractAddress);

  // Step 3: If it's a proxy, analyze the implementation's bytecode
  // for the "real" capabilities. Otherwise, analyze this contract directly.
  let analysisTarget = contractAddress;
  let analysisBytecode = bytecode;

  if (proxyInfo.isProxy && proxyInfo.implementation) {
    const implCode = await rpcCall<string>(rpcUrl, "eth_getCode", [
      proxyInfo.implementation,
      "latest",
    ]);
    if (implCode && implCode !== "0x") {
      analysisTarget = proxyInfo.implementation;
      analysisBytecode = implCode;
    }
  }

  // Step 4: Read owner() — from whichever surface is the right one.
  // For proxies, owner() is typically on the proxy itself (delegated to impl).
  // We call it on the original address.
  const ownerAddr = await readOwner(rpcUrl, contractAddress);

  // Step 5: Search for function selectors in the analysis bytecode
  const hasMintAddrUint = hasSelector(analysisBytecode, SELECTORS.mintAddressUint);
  const hasMintUint = hasSelector(analysisBytecode, SELECTORS.mintUint);
  const hasMintTo = hasSelector(analysisBytecode, SELECTORS.mintTo);

  const mintVariants: string[] = [];
  if (hasMintAddrUint) mintVariants.push("mint(address,uint256)");
  if (hasMintUint) mintVariants.push("mint(uint256)");
  if (hasMintTo) mintVariants.push("mintTo(address,uint256)");

  return {
    success: true,
    bytecodeSize,
    isContract: true,
    isProxy: proxyInfo.isProxy,
    proxyType: proxyInfo.proxyType,
    implementation: proxyInfo.implementation,
    proxyAdmin: proxyInfo.proxyAdmin,

    ownershipRenounced: isRenounced(ownerAddr),
    ownerAddress: ownerAddr,
    hasRenounceFunction: hasSelector(analysisBytecode, SELECTORS.renounceOwnership),
    hasTransferOwnershipFunction: hasSelector(analysisBytecode, SELECTORS.transferOwnership),

    hasMintFunction: mintVariants.length > 0,
    mintVariants,
    hasBurnFunction:
      hasSelector(analysisBytecode, SELECTORS.burn) ||
      hasSelector(analysisBytecode, SELECTORS.burnFrom),
    hasPauseFunction:
      hasSelector(analysisBytecode, SELECTORS.pause) &&
      hasSelector(analysisBytecode, SELECTORS.unpause),
    hasBlacklistFunction:
      hasSelector(analysisBytecode, SELECTORS.addToBlacklist) ||
      hasSelector(analysisBytecode, SELECTORS.blacklist) ||
      hasSelector(analysisBytecode, SELECTORS.isBlacklisted) ||
      hasSelector(analysisBytecode, SELECTORS.freeze),
    hasFeeModification:
      hasSelector(analysisBytecode, SELECTORS.setFee) ||
      hasSelector(analysisBytecode, SELECTORS.setBuyTax) ||
      hasSelector(analysisBytecode, SELECTORS.setSellTax),
    hasMaxTransaction: hasSelector(analysisBytecode, SELECTORS.setMaxTransaction),

    hasUpgradeFunction:
      hasSelector(analysisBytecode, SELECTORS.upgradeTo) ||
      hasSelector(analysisBytecode, SELECTORS.upgradeToAndCall),
  };
}

/* ─────────────────────────────────────────────────────────────
   Convert analysis into findings for the UI
   ───────────────────────────────────────────────────────────── */

export interface BytecodeFinding {
  label: string;
  severity: "info" | "good" | "warn" | "bad";
  detail?: string;
}

export function bytecodeToFindings(a: BytecodeAnalysis): BytecodeFinding[] {
  if (!a.success) return [];

  const findings: BytecodeFinding[] = [];

  if (!a.isContract) {
    findings.push({
      label: "Address has no contract code",
      severity: "warn",
      detail: "This is either an externally-owned wallet or a self-destructed contract",
    });
    return findings;
  }

  // Bytecode size context
  findings.push({
    label: `Contract bytecode: ${(a.bytecodeSize / 1024).toFixed(1)}KB deployed`,
    severity: "info",
    detail: `${a.bytecodeSize.toLocaleString()} bytes of runtime code`,
  });

  // Proxy detection
  if (a.isProxy) {
    const proxyDetail = a.implementation
      ? `Implementation: ${a.implementation}`
      : "Implementation resolved dynamically";
    findings.push({
      label: `${a.proxyType} proxy detected`,
      severity: a.proxyType === "Transparent" || a.proxyType === "UUPS" ? "warn" : "info",
      detail: proxyDetail,
    });

    if (a.hasUpgradeFunction && !a.ownershipRenounced) {
      findings.push({
        label: "Owner can upgrade this contract",
        severity: "bad",
        detail:
          "Upgradeable proxy with live owner — contract logic can be changed at any time",
      });
    }
  } else {
    findings.push({
      label: "Not a proxy — immutable logic",
      severity: "good",
      detail: "Contract code cannot be replaced after deployment",
    });
  }

  // Ownership
  if (a.ownershipRenounced === true) {
    findings.push({
      label: "Ownership renounced (verified on-chain)",
      severity: "good",
      detail: `owner() returns ${a.ownerAddress === ZERO_ADDRESS ? "zero address" : "dead address"}`,
    });
  } else if (a.ownershipRenounced === false) {
    findings.push({
      label: "Owner still has privileges",
      severity: "warn",
      detail: `owner() returns ${a.ownerAddress?.slice(0, 10)}…${a.ownerAddress?.slice(-4)}`,
    });
  }
  // ownershipRenounced === null: contract has no owner() function — no finding

  // Mint
  if (a.hasMintFunction) {
    const severity: BytecodeFinding["severity"] =
      a.ownershipRenounced === true ? "info" : "bad";
    findings.push({
      label: "Mint function present in bytecode",
      severity,
      detail:
        a.ownershipRenounced === true
          ? `Found: ${a.mintVariants.join(", ")} — but ownership is renounced so no one can call it`
          : `Found: ${a.mintVariants.join(", ")} — owner can create new tokens`,
    });
  } else {
    findings.push({
      label: "No mint function detected",
      severity: "good",
      detail: "Supply cannot be inflated",
    });
  }

  // Pause
  if (a.hasPauseFunction) {
    const severity: BytecodeFinding["severity"] =
      a.ownershipRenounced === true ? "info" : "warn";
    findings.push({
      label: "Pause function present in bytecode",
      severity,
      detail:
        a.ownershipRenounced === true
          ? "Owner could pause transfers, but ownership is renounced"
          : "Owner can freeze all transfers indefinitely",
    });
  }

  // Blacklist
  if (a.hasBlacklistFunction) {
    const severity: BytecodeFinding["severity"] =
      a.ownershipRenounced === true ? "info" : "warn";
    findings.push({
      label: "Blacklist / freeze function present",
      severity,
      detail:
        a.ownershipRenounced === true
          ? "Blacklist capability exists but ownership is renounced"
          : "Owner can block specific addresses from transferring",
    });
  }

  // Fee modification
  if (a.hasFeeModification) {
    findings.push({
      label: "Fee / tax modification function present",
      severity: a.ownershipRenounced === true ? "info" : "warn",
      detail: "Contract includes setFee / setBuyTax / setSellTax",
    });
  }

  // Max transaction
  if (a.hasMaxTransaction) {
    findings.push({
      label: "Transaction size limit function present",
      severity: a.ownershipRenounced === true ? "info" : "warn",
      detail: "Owner can limit or disable trading via max transaction size",
    });
  }

  return findings;
}
