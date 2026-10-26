/**
 * Drives the API's `service_status` feature flag for the post-deploy maintenance
 * journey (J3, #3010).
 *
 * - `GET /service_status` is a public read: `{ data: [{ slug, status }] }`.
 * - `PUT /service_status` is admin-gated by `GitHubAuthGuard`: it needs a real
 *   GitHub *user* token (classic PAT) whose login is a team member / repo
 *   writer. Body is `{ slug, status }`; the author is the verified login, never
 *   the body. The controller throttles (5/10s, 30/60s), so poll gently.
 */

/** Mirrors the API's `ServiceStatus` enum (service-status.entity.ts). */
export type ServiceStatusValue = "enabled" | "form_disabled" | "disabled";

/** The current status of `slug`, or null when the service has no status row. */
export async function getServiceStatus(
  apiBaseUrl: string,
  slug: string,
): Promise<ServiceStatusValue | null> {
  const res = await fetch(`${apiBaseUrl}/service_status`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`GET /service_status failed: HTTP ${res.status}`);
  }
  const body = (await res.json()) as {
    data?: { slug: string; status: ServiceStatusValue }[];
  };
  const row = (body.data ?? []).find((r) => r.slug === slug);
  return row?.status ?? null;
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
  const res = await fetch(`${apiBaseUrl}/service_status`, {
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
