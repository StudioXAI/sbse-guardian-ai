/* ─────────────────────────────────────────────────────────────
   INFI Verified Launch Tracker

   Returns true if a contract was launched via INFI MultiChain
   Launchpad (presale or direct listing). Drives the "Secured by
   SbSe Protocol · Listed via INFI MultiChain" badge in the New
   Projects tab.

   IMPLEMENTATION NOTES:
   - For now, this is a static config keyed by (chainId, address).
     Manually maintained by INFI's BD/launchpad ops team.
   - Future versions will fetch from the launchpad's database
     directly, but the public API of this module stays the same so
     callers don't break when the source flips.
   - Two ways to add an entry: (a) edit this file, (b) set the
     INFI_VERIFIED_LAUNCHES env var with a JSON array of entries.
     Env var entries merge with the static config — handy for
     adding a new launch without a code deploy.
   ───────────────────────────────────────────────────────────── */

export interface InfiVerifiedLaunch {
  chainId: number;
  /** Lowercase contract address. */
  contractAddress: string;
  /** Display name — shown in tooltips / badge popovers. */
  name: string;
  /** When this project launched via INFI (epoch ms). */
  launchedAt: number;
  /** Launch type for context. */
  launchType: "presale" | "direct" | "invertx_direct" | "invertx_borrowed";
  /** URL on the launchpad to view the project. */
  launchpadUrl?: string;
}

/* ═══════════════════════════════════════════════════════════ */
/* Static config — INFI BD team adds entries here              */
/* ═══════════════════════════════════════════════════════════ */

const STATIC_LAUNCHES: InfiVerifiedLaunch[] = [
  /* Add real launches here as they happen. Example shape:
  {
    chainId: 1,
    contractAddress: "0xabc...",
    name: "ExampleToken",
    launchedAt: Date.parse("2026-05-01T12:00:00Z"),
    launchType: "presale",
    launchpadUrl: "https://launchpad.infimultichain.com/projects/example",
  },
  */
];

/* ═══════════════════════════════════════════════════════════ */
/* Env var override — entries here merge with the static list  */
/* ═══════════════════════════════════════════════════════════ */

function loadEnvOverrides(): InfiVerifiedLaunch[] {
  const raw = process.env.INFI_VERIFIED_LAUNCHES;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    /* Light validation — bad entries get dropped silently. */
    return parsed.filter((e): e is InfiVerifiedLaunch => {
      return (
        typeof e === "object" &&
        e !== null &&
        typeof e.chainId === "number" &&
        typeof e.contractAddress === "string" &&
        typeof e.name === "string" &&
        typeof e.launchedAt === "number" &&
        typeof e.launchType === "string"
      );
    });
  } catch {
    return [];
  }
}

/* Build the lookup map once on first use. Cheap to build, cached
   for the lifetime of the serverless instance. */
let lookupMap: Map<string, InfiVerifiedLaunch> | null = null;

function getLookupMap(): Map<string, InfiVerifiedLaunch> {
  if (lookupMap) return lookupMap;
  const map = new Map<string, InfiVerifiedLaunch>();
  const all = [...STATIC_LAUNCHES, ...loadEnvOverrides()];
  for (const entry of all) {
    const key = `${entry.chainId}-${entry.contractAddress.toLowerCase()}`;
    map.set(key, entry);
  }
  lookupMap = map;
  return map;
}

/* ═══════════════════════════════════════════════════════════ */
/* Public API                                                   */
/* ═══════════════════════════════════════════════════════════ */

/**
 * Returns the verified-launch entry for a contract, or null if
 * the contract didn't launch through INFI.
 */
export function getInfiLaunch(
  chainId: number,
  contractAddress: string,
): InfiVerifiedLaunch | null {
  const key = `${chainId}-${contractAddress.toLowerCase()}`;
  return getLookupMap().get(key) ?? null;
}

/**
 * Convenience boolean for the badge logic.
 */
export function isInfiVerified(
  chainId: number,
  contractAddress: string,
): boolean {
  return getInfiLaunch(chainId, contractAddress) !== null;
}

/**
 * Total count of verified launches — surfaced in stats.
 */
export function getInfiLaunchCount(): number {
  return getLookupMap().size;
}
