/* ─────────────────────────────────────────────────────────────
   Simple in-memory sliding-window rate limiter.
   Good enough for single-instance / preview deployments.
   For multi-instance production, swap for Upstash/Redis.
   ───────────────────────────────────────────────────────────── */

interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Bucket>();

const WINDOW_MS = 60_000; // 1 minute
const MAX_HITS = 15; // 15 scans per minute per IP

export interface RateResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

export function rateLimit(key: string): RateResult {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < WINDOW_MS);

  if (bucket.hits.length >= MAX_HITS) {
    const oldest = bucket.hits[0];
    const retryAfterSec = Math.ceil((WINDOW_MS - (now - oldest)) / 1000);
    buckets.set(key, bucket);
    return { allowed: false, remaining: 0, retryAfterSec };
  }

  bucket.hits.push(now);
  buckets.set(key, bucket);

  return {
    allowed: true,
    remaining: MAX_HITS - bucket.hits.length,
    retryAfterSec: 0,
  };
}

export function clientKey(req: Request): string {
  // x-forwarded-for works on Vercel/most edge hosts.
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "anonymous";
}

// Periodically prune empty buckets to avoid unbounded memory growth.
if (typeof setInterval !== "undefined") {
  const handle: unknown = setInterval(() => {
    const now = Date.now();
    for (const [k, b] of buckets) {
      b.hits = b.hits.filter((t) => now - t < WINDOW_MS);
      if (b.hits.length === 0) buckets.delete(k);
    }
  }, 5 * 60_000);
  // Don't block Node's event loop from exiting; no-op in the browser.
  (handle as { unref?: () => void })?.unref?.();
}
