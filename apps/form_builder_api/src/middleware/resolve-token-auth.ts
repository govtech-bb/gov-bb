import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Constant-time, fail-closed token compare. Both tokens are hashed to a
 * fixed-length SHA-256 digest before comparison so `timingSafeEqual` never
 * throws on a length mismatch and the configured token's length is not leaked
 * via timing.
 *
 * DELIBERATELY DUPLICATED from apps/api/src/common/secret-token.ts
 * (`isValidSecretToken`) — see ADR 0061. The two backend services keep their
 * own copy of the dev-bypass policy rather than share a workspace package, to
 * avoid a cross-package build edge for ~15 lines of logic. Keep them in sync.
 */
function isValidSecretToken(
  configuredToken: string,
  providedToken: string | undefined,
): boolean {
  if (!configuredToken) return false;
  if (!providedToken) return false;

  const a = createHash("sha256").update(configuredToken).digest();
  const b = createHash("sha256").update(providedToken).digest();
  return timingSafeEqual(a, b);
}

/**
 * The single dev-bypass + token-match policy decision — see ADR 0061.
 *
 *   - `misconfigured` — no secret configured in production: fail closed.
 *   - `passthrough`   — no secret configured outside production: dev bypass.
 *   - `ok`            — secret configured and the presented token matches.
 *   - `denied`        — secret configured but the presented token is
 *                       absent/empty or does not match.
 *
 * Header extraction and HTTP-status mapping are the caller's job. `denied`
 * collapses "missing" and "mismatch"; the Express adapter inspects `presented`
 * itself to keep the existing 401-vs-403 distinction.
 *
 * DELIBERATELY DUPLICATED from apps/api/src/common/resolve-token-auth.ts — see
 * ADR 0061. Keep the two copies (and their specs) in sync.
 */
export type TokenAuthDecision =
  | "ok"
  | "passthrough"
  | "denied"
  | "misconfigured";

export function resolveTokenAuth(args: {
  presented: string | undefined;
  expected: string | undefined;
  isProd: boolean;
}): TokenAuthDecision {
  const { presented, expected, isProd } = args;
  if (!expected) return isProd ? "misconfigured" : "passthrough";
  return isValidSecretToken(expected, presented) ? "ok" : "denied";
}
