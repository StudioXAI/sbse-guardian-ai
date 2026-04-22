/* ─────────────────────────────────────────────────────────────
   INFI Project Fetcher
   - Native fetch, no axios
   - 5-minute in-memory cache (projects rarely change)
   - 12s timeout (down from 20s)
   - No console.log spam in production
   ───────────────────────────────────────────────────────────── */

import { INFI_CACHE_TTL_MS, debug } from "./constants";
import { fetchJson } from "./fetchHelpers";

const API_BASE = "https://launchpad.infimultichain.com/users";

export interface InfiProject {
  id: string | number;
  name: string;
  symbol: string;
  contract: string;
  owner: string;
  chain: string;
  type: string;
  liquidity: unknown;
  listed: boolean;
  featured: boolean;
  active: boolean;
  website: string;
  status: string;
  source: string;
}

let cached: { at: number; data: InfiProject[] } | null = null;

function normalizeProject(p: any): InfiProject | null {
  if (!p?.token_address || !p?.token_name) return null;
  return {
    id: p.id,
    name: p.token_name,
    symbol: p.token_symbol,
    contract: p.token_address,
    owner: p.owner_address,
    chain: p.chainName,
    type: p.type,
    liquidity: p.liquidity,
    listed: p.is_listed === 1,
    featured: p.is_feature === 1,
    active: p.is_active === 1,
    website: p.website,
    status: "verified",
    source: "INFI Official Backend",
  };
}

export async function fetchInfiProjects(): Promise<InfiProject[]> {
  const now = Date.now();
  if (cached && now - cached.at < INFI_CACHE_TTL_MS) {
    debug("INFI cache hit");
    return cached.data;
  }

  try {
    const [listedRes, upcomingRes] = await Promise.all([
      fetchJson<any>(`${API_BASE}/getAllListedApplicationForms`, 12_000),
      fetchJson<any>(`${API_BASE}/getAllUpcommingApplicationForms`, 12_000),
    ]);

    const listed = listedRes?.data?.liquidityApplications || [];
    const listedPresales = listedRes?.data?.presaleApplications || [];
    const upcoming = upcomingRes?.data?.presaleApplications || [];

    const all = [...listed, ...listedPresales, ...upcoming];
    const map = new Map<string, InfiProject>();

    for (const raw of all) {
      const p = normalizeProject(raw);
      if (p) map.set(p.contract.toLowerCase(), p);
    }

    const data = Array.from(map.values());
    cached = { at: now, data };
    debug(`Loaded ${data.length} INFI projects`);
    return data;
  } catch (error) {
    debug("INFI fetch failed:", error);
    // Return cached data if available, even if expired.
    return cached?.data ?? [];
  }
}
