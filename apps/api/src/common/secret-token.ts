import { createHash, timingSafeEqual } from "node:crypto";

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
 * Both tokens are hashed to SHA-256 (32-byte fixed-length) before comparison.
 * This ensures `timingSafeEqual` never throws on a length mismatch (which
 * would happen if we compared raw token buffers of unequal length) AND avoids
 * leaking the configured token's length via a timing side-channel.
 *
 * Never log either token.
 */
export function isValidSecretToken(
  configuredToken: string,
  providedToken: string | undefined,
): boolean {
  if (!configuredToken) return false;
  if (!providedToken) return false;

  const a = createHash("sha256").update(configuredToken).digest();
  const b = createHash("sha256").update(providedToken).digest();
  return timingSafeEqual(a, b);
}
