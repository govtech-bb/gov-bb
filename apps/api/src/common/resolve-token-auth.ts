import { isValidSecretToken } from "./secret-token";

/**
 * The single dev-bypass + token-match policy decision, shared by every
 * service-to-service token boundary. See ADR 0061.
 *
 *   - `misconfigured` — no secret configured in production: fail closed.
 *   - `passthrough`   — no secret configured outside production: dev bypass.
 *   - `ok`            — secret configured and the presented token matches.
 *   - `denied`        — secret configured but the presented token is
 *                       absent/empty or does not match.
 *
 * Header extraction and HTTP-status mapping are the caller's (adapter's) job;
 * this function is pure and framework-free so the same decision table can be
 * reused by the apps/api Nest guard and form_builder_api's Express middleware.
 * `denied` deliberately collapses "missing" and "mismatch" — an adapter that
 * needs to distinguish them (e.g. 401 vs 403) inspects `presented` itself.
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
