/**
 * Reads and removes case-management (CaMS) test cases for the post-deploy
 * case-management journey (J4, #3011/#3861).
 *
 * J4 submits a dedicated preview test form whose webhook maps to a reserved
 * `E2E_`-prefixed test programme (ADR 0087), then follows the submission into
 * CaMS: it asserts a case was created with the same reference code and the
 * uploaded file copied across, then removes the test case to leave no residue.
 *
 * Both calls target CaMS by `x-api-key` — the same per-ministry key CaMS issues
 * for the `E2E_` test programme, carried in CI as E2E_CAMS_API_KEY. The key is
 * scoped to a NON-PROD CaMS (J4 runs on staging; see ADR 0087's environment
 * scope), so a test case is removable and never a real one.
 *
 * PROPOSED CONTRACT. CaMS exposes only `POST /api/cases` today; the read and
 * delete endpoints below (`GET`/`DELETE /api/cases/{code}`) are the machine
 * contract J4 needs and are not provisioned yet. The CI job soft-skips until
 * the key (and these endpoints) exist, so this helper is dormant, not wrong —
 * keep it in step with what CaMS provisions.
 */

/** A CaMS case as J4 needs to read it back. Narrow on purpose — the contract
 * may carry more, but J4 only asserts the reference code and that the uploaded
 * file was copied across. `files` is the proposed name for that array; each
 * entry names a copied upload. */
export interface CamsCase {
  code: string;
  files: { name: string }[];
}

/**
 * Validate the CaMS base is HTTPS on the government domain before any request —
 * the base comes from CI config, but an allowlist keeps a mistyped/injected host
 * from turning this into an SSRF against an internal address. Mirrors
 * service-status.ts's `trustedApiBase`.
 */
function trustedCamsBase(baseUrl: string): URL {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error(`E2E_CAMS_BASE_URL is not a valid URL: ${baseUrl}`);
  }
  const host = url.hostname;
  const trusted = host === "alpha.gov.bb" || host.endsWith(".alpha.gov.bb");
  if (url.protocol !== "https:" || !trusted) {
    throw new Error(
      `Refusing to call an untrusted CaMS base: ${baseUrl} — expected https on *.alpha.gov.bb`,
    );
  }
  return url;
}

/**
 * Fetch a case by its reference `code`. Returns `null` on 404 so the J4 poll can
 * wait for the async webhook (SQS) to land the case. Throws with the response
 * body on any other non-2xx so an auth (401/403) or server failure surfaces
 * clearly in the test log.
 *
 * Targets the PROPOSED `GET /api/cases/{code}` CaMS contract (see file header).
 */
export async function getCaseByCode(
  baseUrl: string,
  apiKey: string,
  code: string,
): Promise<CamsCase | null> {
  const endpoint = new URL(
    `/api/cases/${encodeURIComponent(code)}`,
    trustedCamsBase(baseUrl),
  );
  const res = await fetch(endpoint, {
    method: "GET",
    headers: { "x-api-key": apiKey, Accept: "application/json" },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `GET /api/cases/${code} failed: HTTP ${res.status} ${detail}`,
    );
  }
  return (await res.json()) as CamsCase;
}

/**
 * Remove a test case by its reference `code`. Throws with the response body on
 * any non-2xx so a cleanup failure surfaces clearly — J4 treats a failed
 * cleanup on an otherwise-green run as RED, since a test case left in CaMS is
 * residue.
 *
 * Targets the PROPOSED `DELETE /api/cases/{code}` CaMS contract (see file
 * header). CaMS registers every `E2E_` programme as `isTest`, so only a
 * removable test case is ever reachable here (ADR 0087).
 */
export async function removeTestCase(
  baseUrl: string,
  apiKey: string,
  code: string,
): Promise<void> {
  const endpoint = new URL(
    `/api/cases/${encodeURIComponent(code)}`,
    trustedCamsBase(baseUrl),
  );
  const res = await fetch(endpoint, {
    method: "DELETE",
    headers: { "x-api-key": apiKey, Accept: "application/json" },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `DELETE /api/cases/${code} failed: HTTP ${res.status} ${detail}`,
    );
  }
}
