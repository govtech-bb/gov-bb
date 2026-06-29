import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time check that `providedToken` matches the `configuredToken`.
 *
 * Generic guarded-header secret check, shared by every feature that gates an
 * endpoint behind a token-validated request header (recipe preview, file
 * preview, smoke-submission processor bypass, admin endpoints, …).
 *
 * Fail-closed semantics:
 *   - If `configuredToken` is empty/falsy the feature is disabled — return
 *     false unconditionally, even when `providedToken` is also empty. This
 *     prevents an accidental `"" === ""` match that would enable the gated
 *     behaviour whenever the env var is not set.
 *   - If `providedToken` is empty/undefined → return false.
 *
 * The body of the comparison is constant-time via `timingSafeEqual`. We do NOT
 * hash the tokens first: these are fixed, high-entropy shared secrets compared
 * for equality, not user passwords stored at rest — hashing them would add no
 * security and trips the `js/insufficient-password-hash` scanner. `timingSafeEqual`
 * requires equal-length buffers, so a length mismatch (which can never be a
 * match) returns early; we run a same-length compare first so the timing of the
 * mismatch path doesn't trivially reveal more than the length already does. The
 * only side-channel is the configured token's length, which is not secret.
 *
 * Never log either token.
 */
export function isValidSecretToken(
  configuredToken: string,
  providedToken: string | undefined,
): boolean {
  if (!configuredToken) return false;
  if (!providedToken) return false;

  const a = Buffer.from(configuredToken, "utf8");
  const b = Buffer.from(providedToken, "utf8");
  if (a.length !== b.length) {
    // Keep the comparison cost uniform regardless of which token is longer.
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}
