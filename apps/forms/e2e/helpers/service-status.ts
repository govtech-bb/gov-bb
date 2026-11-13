/**
 * Drives the API's `service_status` feature flag for the post-deploy maintenance
 * journey (J3, #3010).
 *
 * `PUT /service_status` is admin-gated by `GitHubAuthGuard`: it needs a real
 * GitHub *user* token. In CI this is E2E_SERVICE_STATUS_TOKEN — the
 * `govtech-bb-e2e` fine-grained token (org Members: read only, member of
 * `feature-management-sandbox` only, no repo access), scoped to sandbox (#3363).
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
    // The likeliest real failure (e.g. the 2027-02-01 expiry) is a still-set but
    // invalid token → 401/403 here, not the empty-token guard in the workflow. So
    // point on-call at the renewal path from this message too (#3363).
    const hint =
      res.status === 401 || res.status === 403
        ? " — E2E_SERVICE_STATUS_TOKEN is expired or lacks access; renew it per #3363"
        : "";
    throw new Error(
      `PUT /service_status (${slug} → ${status}) failed: HTTP ${res.status} ${detail}${hint}`,
    );
  }
}
