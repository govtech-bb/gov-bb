/**
 * Drives the API's `service_status` feature flag for the post-deploy maintenance
 * journey (J3, #3010).
 *
 * `PUT /service_status` is admin-gated by `GitHubAuthGuard`: it needs a real
 * GitHub *user* token (classic PAT) whose login is a team member / repo writer.
 * Body is `{ slug, status }`; the author is the verified login, never the body.
 * The controller throttles (5/10s), so callers should flip sparingly.
 */

/** Mirrors the API's `ServiceStatus` enum (service-status.entity.ts). */
export type ServiceStatusValue = "enabled" | "form_disabled" | "disabled";

/**
 * Validate the API base is HTTPS on the government domain before any request —
 * the base comes from CI config, but an allowlist keeps a mistyped/injected host
 * from turning this into an SSRF against an internal address.
 */
function trustedApiBase(apiBaseUrl: string): URL {
  let url: URL;
  try {
    url = new URL(apiBaseUrl);
  } catch {
    throw new Error(`E2E_API_BASE_URL is not a valid URL: ${apiBaseUrl}`);
  }
  const host = url.hostname;
  const trusted = host === "alpha.gov.bb" || host.endsWith(".alpha.gov.bb");
  if (url.protocol !== "https:" || !trusted) {
    throw new Error(
      `Refusing to call an untrusted API base: ${apiBaseUrl} — expected https on *.alpha.gov.bb`,
    );
  }
  return url;
}

/**
 * Set `slug` to `status`. Throws with the response body on a non-2xx so an auth
 * (401/403) or validation failure surfaces clearly in the test log.
 */
export async function setServiceStatus(
  apiBaseUrl: string,
  token: string,
  slug: string,
  status: ServiceStatusValue,
): Promise<void> {
  const endpoint = new URL("/service_status", trustedApiBase(apiBaseUrl));
  const res = await fetch(endpoint, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ slug, status }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `PUT /service_status (${slug} → ${status}) failed: HTTP ${res.status} ${detail}`,
    );
  }
}
