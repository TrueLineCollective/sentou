// In-process fixed-window rate limiter. Sentou already assumes a single Node process for its
// file store, so an in-memory limiter is the right scope: no extra dependency, and it resets on
// restart (fine for abuse control). A multi-instance deploy would need a shared store, which is
// out of scope until the architecture itself is multi-instance (documented in the README).

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export type RateResult = { ok: boolean; retryAfterSec: number };

export function rateLimit(key: string, limit: number, windowMs: number, now: number = Date.now()): RateResult {
  // Opportunistic sweep so the map can't grow without bound under key churn (e.g. rotating IPs).
  if (buckets.size > 10_000) {
    for (const [k, b] of buckets) if (now >= b.resetAt) buckets.delete(k);
  }
  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  if (b.count >= limit) return { ok: false, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) };
  b.count += 1;
  return { ok: true, retryAfterSec: 0 };
}

// Best-effort client identity for keying limits. Honor the first hop of x-forwarded-for (set by
// the reverse proxy you deploy behind); fall back to a shared bucket rather than no limit when no
// proxy header is present, so a misconfigured proxy fails safe instead of disabling the limiter.
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

// Test-only: clear all buckets so cases in one file don't bleed limits into each other.
export function __resetRateLimits(): void {
  buckets.clear();
}
