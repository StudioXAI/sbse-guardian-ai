/* ─────────────────────────────────────────────────────────────
   In-memory TTL cache — same pattern as lib/aiSummary.ts.
   Keeps Alpha free of external storage requirements; data
   refreshes on its own schedule.
   ───────────────────────────────────────────────────────────── */

interface CacheEntry<T> {
  at: number;
  data: T;
}

export class TtlCache<T> {
  private store = new Map<string, CacheEntry<T>>();
  constructor(private ttlMs: number) {}

  get(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() - entry.at > this.ttlMs) {
      this.store.delete(key);
      return null;
    }
    return entry.data;
  }

  /** Return cached value even if expired. Useful as a stale fallback. */
  getStale(key: string): T | null {
    return this.store.get(key)?.data ?? null;
  }

  set(key: string, data: T): void {
    this.store.set(key, { at: Date.now(), data });
  }
}
