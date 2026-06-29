const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

/**
 * The registrable domain of a hostname, approximated as its last two
 * dot-labels (`forms.sandbox.alpha.gov.bb` → `gov.bb`, `localhost` →
 * `localhost`). This is a heuristic sufficient for this platform's hosts
 * (`*.gov.bb`, `*.amplifyapp.com`, `localhost`) — NOT a full Public Suffix
 * List implementation.
 */
export function registrableDomain(hostname: string): string {
  return hostname.split(".").slice(-2).join(".");
}

/** True when two hostnames share a registrable domain (browser "same-site"). */
export function sharesSite(hostA: string, hostB: string): boolean {
  return registrableDomain(hostA) === registrableDomain(hostB);
}

/**
 * Whether it is safe to drop the `?preview=` token from the URL and rely on the
 * shared `preview` cookie instead (#1646 Phase 3).
 *
 * The cookie is `SameSite=Lax`, so the browser only sends it on same-site
 * requests. That holds when the forms app and the API share a registrable
 * domain (sandbox/prod under `*.gov.bb`, or `localhost` in dev) — there the
 * cookie persists and a token-less refetch succeeds. On per-PR Amplify previews
 * the forms app is on `*.amplifyapp.com` while the API is on `*.gov.bb`
 * (cross-site), so the cookie is inert and the token must stay in the URL or the
 * cookie-less refetch would 404.
 */
export function canDropPreviewToken(pageHostname: string): boolean {
  try {
    return sharesSite(pageHostname, new URL(API_URL).hostname);
  } catch {
    return false;
  }
}
