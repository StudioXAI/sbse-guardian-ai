/* ─────────────────────────────────────────────────────────────
   Unlock Store
   Tracks which (walletAddress, contractAddress) pairs have premium
   access unlocked for this month.

   Simple in-memory store for MVP. For production scale, swap to
   Vercel KV or Redis. The user can always re-verify their tx hash
   if they hit a cold function instance.

   Key format: `${chainId}:${wallet}:${contract}`
   ───────────────────────────────────────────────────────────── */

const UNLOCK_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface UnlockEntry {
  unlockedAt: number;
  txHash: string;
  chainId: number;
  amountUsd: number;
}

const store = new Map<string, UnlockEntry>();

function key(wallet: string, contract: string): string {
  return `${wallet.toLowerCase()}:${contract.toLowerCase()}`;
}

export function recordUnlock(
  wallet: string,
  contract: string,
  entry: Omit<UnlockEntry, "unlockedAt">,
): void {
  store.set(key(wallet, contract), {
    ...entry,
    unlockedAt: Date.now(),
  });

  // Periodic prune — removes entries older than TTL
  if (store.size > 1000) {
    const cutoff = Date.now() - UNLOCK_TTL_MS;
    for (const [k, v] of store) {
      if (v.unlockedAt < cutoff) store.delete(k);
    }
  }
}

export function isUnlocked(wallet: string, contract: string): boolean {
  const entry = store.get(key(wallet, contract));
  if (!entry) return false;
  if (Date.now() - entry.unlockedAt > UNLOCK_TTL_MS) {
    store.delete(key(wallet, contract));
    return false;
  }
  return true;
}

export function getUnlockInfo(
  wallet: string,
  contract: string,
): UnlockEntry | null {
  const entry = store.get(key(wallet, contract));
  if (!entry) return null;
  if (Date.now() - entry.unlockedAt > UNLOCK_TTL_MS) {
    store.delete(key(wallet, contract));
    return null;
  }
  return entry;
}
