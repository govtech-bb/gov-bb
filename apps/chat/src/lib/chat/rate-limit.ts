// Per-IP fixed-window request limiter for the public POST /api/chat endpoint.
//
// Each chat turn triggers a RAG lookup + a paid Bedrock inference, so an
// unthrottled public endpoint is a cost-amplification / DoS vector. This caps
// requests per client IP per 60s window as defense-in-depth ALONGSIDE the AWS
// WAF rate-based rule (see docs/runbooks/aws-security.md) — it is not the
// perimeter. Mirrors the posture of apps/form_builder_api's express-rate-limit
// (60s window, env-tunable limit, in-memory) and apps/api's throttler.
//
// Buckets are in-memory PER PROCESS: each container/instance owns its own
// counters, so with N instances the effective ceiling is N× the limit. That's
// acceptable for a speed-bump; switch to a shared store (Redis) if/when
// horizontal scaling makes the per-instance buckets material. Retune via the
// CHAT_RATE_LIMIT env var rather than widening the default in code.

const WINDOW_MS = 60_000;

/** Sweep expired buckets once the Map grows past this, so it stays bounded. */
const SWEEP_THRESHOLD = 10_000;

export interface RateLimitResult {
  limited: boolean;
  limit: number;
  /** Requests left in the current window (0 once limited). */
  remaining: number;
  /** Unix ms when the current window resets. */
  resetAt: number;
  /** Seconds until reset — >= 1 when limited, 0 otherwise (for Retry-After). */
  retryAfterSec: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/**
 * Best-effort client IP. Behind CloudFront/Amplify the socket peer is the
 * proxy, so we read `x-forwarded-for` and take the first (client) entry.
 *
 * This is a SPEED-BUMP, not airtight identity: a client can send its own
 * `x-forwarded-for`, so a determined attacker can rotate the key. Un-spoofable
 * IP identification is the WAF/edge's job. Header-less callers share the
 * "unknown" bucket. (This is still finer-grained than form_builder_api, which
 * keys on the proxy IP and effectively shares one bucket per task.)
 */
export function getClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  const first = xff?.split(",")[0]?.trim();
  return first || "unknown";
}

/**
 * Record one request from `ip` and report whether it exceeds `limit` within the
 * current 60s window. `now` is injectable for deterministic tests.
 */
export function checkRateLimit(
  ip: string,
  limit: number,
  now: number = Date.now(),
): RateLimitResult {
  if (buckets.size > SWEEP_THRESHOLD) {
    for (const [key, b] of buckets) if (b.resetAt <= now) buckets.delete(key);
  }

  let bucket = buckets.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(ip, bucket);
  }
  bucket.count += 1;

  const limited = bucket.count > limit;
  return {
    limited,
    limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
    retryAfterSec: limited
      ? Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
      : 0,
  };
}

/**
 * IETF draft-7 `RateLimit` headers so clients can self-throttle. Returned on the
 * 429 (and safe to spread onto any response).
 */
export function rateLimitHeaders(r: RateLimitResult): Record<string, string> {
  const resetSec = Math.max(0, Math.ceil((r.resetAt - Date.now()) / 1000));
  return {
    "RateLimit-Policy": `${r.limit};w=${WINDOW_MS / 1000}`,
    RateLimit: `limit=${r.limit}, remaining=${r.remaining}, reset=${resetSec}`,
  };
}

/** Test seam: clear all buckets between test cases. */
export function __resetRateLimitForTest(): void {
  buckets.clear();
}
