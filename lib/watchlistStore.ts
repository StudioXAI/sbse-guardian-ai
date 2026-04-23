/* ─────────────────────────────────────────────────────────────
   Watchlist Store
   In-memory map; swap to Vercel KV / Postgres for production scale.
   Keyed by (email, chainId, contract).
   ───────────────────────────────────────────────────────────── */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface WatchEntry {
  id: string;
  email: string;
  walletAddress: string;
  contractAddress: string;
  chainId: number;
  chainName: string;
  projectName: string;
  createdAt: number;
  lastOwner?: string | null;
  lastLiquidityUsd?: number | null;
  lastCheckedAt?: number;
  lastNotifiedAt?: number;
  active: boolean;
}

const store = new Map<string, WatchEntry>();

function keyFor(email: string, contract: string, chainId: number): string {
  return `${email.toLowerCase()}::${chainId}::${contract.toLowerCase()}`;
}

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

export function addWatch(entry: Omit<WatchEntry, "id" | "createdAt" | "active">): WatchEntry {
  const id = keyFor(entry.email, entry.contractAddress, entry.chainId);
  const existing = store.get(id);
  const record: WatchEntry = {
    ...entry,
    id,
    email: entry.email.toLowerCase(),
    contractAddress: entry.contractAddress.toLowerCase(),
    walletAddress: entry.walletAddress.toLowerCase(),
    createdAt: existing?.createdAt ?? Date.now(),
    active: true,
    lastOwner: existing?.lastOwner,
    lastLiquidityUsd: existing?.lastLiquidityUsd,
    lastCheckedAt: existing?.lastCheckedAt,
    lastNotifiedAt: existing?.lastNotifiedAt,
  };
  store.set(id, record);
  return record;
}

export function removeWatch(email: string, contract: string, chainId: number): boolean {
  return store.delete(keyFor(email, contract, chainId));
}

export function listWatchesForEmail(email: string): WatchEntry[] {
  const target = email.toLowerCase();
  return Array.from(store.values()).filter((w) => w.email === target && w.active);
}

export function listAllActiveWatches(): WatchEntry[] {
  return Array.from(store.values()).filter((w) => w.active);
}

export function updateSnapshot(
  id: string,
  snapshot: { lastOwner?: string | null; lastLiquidityUsd?: number | null },
): void {
  const entry = store.get(id);
  if (!entry) return;
  if (snapshot.lastOwner !== undefined) entry.lastOwner = snapshot.lastOwner;
  if (snapshot.lastLiquidityUsd !== undefined) entry.lastLiquidityUsd = snapshot.lastLiquidityUsd;
  entry.lastCheckedAt = Date.now();
}

export function markNotified(id: string): void {
  const entry = store.get(id);
  if (entry) entry.lastNotifiedAt = Date.now();
}
