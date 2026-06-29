import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Per-process random key for the comparison HMAC. It exists only to turn each
// token into a fixed-length, length-hiding digest for `timingSafeEqual`; it is
// never persisted and security doesn't depend on it (the secret is the shared
// token, not this key). Using a keyed HMAC rather than a bare SHA-256 digest
// also keeps this off the `js/insufficient-password-hash` path — these are
// fixed high-entropy shared secrets compared in constant time, not passwords
// hashed for storage.
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
 * Both tokens are reduced to a 32-byte fixed-length HMAC (keyed with a
 * per-process random key) before comparison. The fixed length ensures
 * `timingSafeEqual` never throws on a length mismatch (which would happen if we
 * compared raw token buffers of unequal length) AND avoids leaking the
 * configured token's length via a timing side-channel.
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
