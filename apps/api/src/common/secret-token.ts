import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Per-process random key. HMAC-ing both tokens through it yields fixed-length
// (32-byte) digests to compare, so `timingSafeEqual` never throws on a length
// mismatch and the configured token's length is not leaked via timing. A keyed
// MAC (not a bare digest of the secret) sidesteps the fast-hash concern of
// hashing the token directly.
const COMPARE_KEY = randomBytes(32);

/**
 * Constant-time check that `providedToken` matches the `configuredToken`.
 *
 * Generic guarded-header secret check, shared by every feature that gates an
 * endpoint behind a token-validated request header (recipe preview, file
 * preview, smoke-submission processor bypass, …).
 *
 * Fail-closed semantics:
 *   - If `configuredToken` is empty/falsy the feature is disabled — return
 *     false unconditionally, even when `providedToken` is also empty. This
 *     prevents an accidental `"" === ""` match that would enable the gated
 *     behaviour whenever the env var is not set.
 *   - If `providedToken` is empty/undefined → return false.
 *
 * Never log either token.
 */
export function isValidSecretToken(
  configuredToken: string,
  providedToken: string | undefined,
): boolean {
  if (!configuredToken) return false;
  if (!providedToken) return false;

  const a = createHmac("sha256", COMPARE_KEY).update(configuredToken).digest();
  const b = createHmac("sha256", COMPARE_KEY).update(providedToken).digest();
  return timingSafeEqual(a, b);
}
