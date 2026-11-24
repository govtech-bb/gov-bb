#!/usr/bin/env node
/**
 * Post-deploy check that api v1, api_v2 and landing accept the same preview
 * token (#3781). api v1's RECIPE_PREVIEW_TOKEN, api_v2's PREVIEW_SECRET and
 * landing's PREVIEW_SECRET must be equal in each environment; nothing else
 * fails when they drift, previews just 404.
 *
 * Inputs (env vars set by the deploy workflows):
 *   PREVIEW_TOKEN  the environment's RECIPE_PREVIEW_TOKEN secret
 *   API_V1_URL     api v1 base, e.g. https://forms.api.sandbox.alpha.gov.bb
 *   API_V2_URL     api_v2 base, with /v2
 *   LANDING_URL    landing origin
 *
 * Each system is asked something only a valid token unlocks, and each preview
 * item is also read without the token, so an item that is public by mistake
 * can't make the check pass:
 *   - api_v2: GET /catalog with `x-preview-token` (a wrong token is a 401),
 *     then the first `preview` page: 200 with the token, 404 without.
 *   - api v1: GET /form-definitions with `x-recipe-preview`; only a valid
 *     token stamps each form's `visibility`. Then the first non-public form:
 *     200 with the token, 404 without.
 *   - landing, only once it reads api_v2 (`x-content-source` on public
 *     pages): `?preview=<token>` must set the `preview` cookie; then, with
 *     the cookie, api_v2's preview page must come from api_v2, and 404
 *     without it.
 *
 * Prints which system refused, never the token, and exits 1 on any failure.
 */

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface Targets {
  apiV1: string;
  apiV2: string;
  landing: string;
}

export interface Report {
  /** One line per system that refused or broke; any makes the run fail. */
  failures: string[];
  /** What passed or was skipped, for the log. */
  notes: string[];
}

/** Public pages read to tell whether landing serves api_v2 content. */
const SOURCE_PROBES = 5;

/** A GET as the checks make it: no redirects followed, retried on 5xx. */
type Get = (url: string, headers?: Record<string, string>) => Promise<Response>;

/** A GET that retries network errors and 5xx, which a fresh deploy can give. */
function retrying(fetchImpl: Fetch, retryDelayMs: number): Get {
  const attempts = 3;
  return async (url, headers = {}) => {
    for (let attempt = 1; ; attempt++) {
      try {
        const response = await fetchImpl(url, {
          headers,
          redirect: "manual",
          signal: AbortSignal.timeout(20_000),
        });
        if (response.status < 500 || attempt === attempts) return response;
      } catch (error) {
        // Only the cause's code: a fetch error's message can quote the URL,
        // and landing's URL carries the token.
        if (attempt === attempts) {
          const failure = error as { name?: string; cause?: { code?: string } };
          const code =
            failure.name === "TimeoutError" ? "timeout" : failure.cause?.code;
          // No `cause`: it holds that message, and it must not reach a log.
          // oxlint-disable-next-line preserve-caught-error
          throw new Error(`request failed (${code ?? "network error"})`);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  };
}

async function json(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

interface CatalogPage {
  url: string;
  visibility?: string;
}

async function checkApiV2(
  apiV2: string,
  token: string,
  report: Report,
  get: Get,
): Promise<CatalogPage[] | undefined> {
  const catalog = await get(`${apiV2}/catalog`, { "x-preview-token": token });
  if (catalog.status === 401) {
    report.failures.push(
      "api_v2 refused the preview token (401 on /catalog): its PREVIEW_SECRET differs from RECIPE_PREVIEW_TOKEN",
    );
    return undefined;
  }
  const pages = ((await json(catalog)) as { pages?: unknown })?.pages;
  if (catalog.status !== 200 || !Array.isArray(pages)) {
    report.failures.push(
      `api_v2: GET /catalog with the token returned HTTP ${catalog.status}, not a page list`,
    );
    return undefined;
  }
  const preview = (pages as CatalogPage[]).find(
    (page) => page.visibility === "preview",
  );
  if (!preview) {
    report.notes.push(
      "api_v2 accepts the preview token (no preview page to read)",
    );
    return pages as CatalogPage[];
  }
  const path = `${apiV2}/pages?url=${encodeURIComponent(preview.url)}`;
  const withToken = await get(path, { "x-preview-token": token });
  const without = await get(path);
  // /catalog already accepted the token, so a miss here is not a refusal.
  if (withToken.status !== 200)
    report.failures.push(
      `api_v2 accepted the preview token on /catalog, but preview page ${preview.url} gave HTTP ${withToken.status} with it`,
    );
  else if (without.status !== 404)
    report.failures.push(
      `api_v2 serves preview page ${preview.url} without the token (HTTP ${without.status}, not 404)`,
    );
  else report.notes.push(`api_v2 accepts the preview token (${preview.url})`);
  return pages as CatalogPage[];
}

async function checkApiV1(
  apiV1: string,
  token: string,
  report: Report,
  get: Get,
): Promise<void> {
  const list = await get(`${apiV1}/form-definitions`, {
    "x-recipe-preview": token,
  });
  const forms = ((await json(list)) as { data?: unknown })?.data;
  if (list.status !== 200 || !Array.isArray(forms) || forms.length === 0) {
    report.failures.push(
      `api v1: GET /form-definitions with the token returned HTTP ${list.status}, not a form list`,
    );
    return;
  }
  const entries = forms as { formId: string; visibility?: string }[];
  // The public list has no `visibility`; only a valid token adds it.
  if (!entries.every((form) => typeof form.visibility === "string")) {
    report.failures.push(
      "api v1 refused the preview token (/form-definitions gave the public list): its RECIPE_PREVIEW_TOKEN differs from the GitHub secret",
    );
    return;
  }
  // Journey 3 flips e2e-maintenance-check to public and back while this runs.
  const hidden = entries.find(
    (form) =>
      form.visibility !== "public" && form.formId !== "e2e-maintenance-check",
  );
  if (!hidden) {
    report.notes.push(
      "api v1 accepts the preview token (no non-public form to read)",
    );
    return;
  }
  const path = `${apiV1}/form-definitions/${encodeURIComponent(hidden.formId)}`;
  const withToken = await get(path, { "x-recipe-preview": token });
  const without = await get(path);
  // The list already accepted the token, so a miss here is not a refusal.
  if (withToken.status !== 200)
    report.failures.push(
      `api v1 accepted the preview token on /form-definitions, but form ${hidden.formId} gave HTTP ${withToken.status} with it`,
    );
  else if (without.status !== 404)
    report.failures.push(
      `api v1 serves non-public form ${hidden.formId} without the token (HTTP ${without.status}, not 404)`,
    );
  else report.notes.push(`api v1 accepts the preview token (${hidden.formId})`);
}

async function checkLanding(
  landing: string,
  token: string,
  pages: CatalogPage[],
  report: Report,
  get: Get,
): Promise<void> {
  // Each public page's x-content-source. `static` also follows an api_v2
  // miss, so landing counts as static only when every probe says so.
  const probes: { url: string; source: string }[] = [];
  for (const page of pages
    .filter((page) => page.visibility !== "preview")
    .slice(0, SOURCE_PROBES)) {
    const source = (await get(`${landing}${page.url}`)).headers.get(
      "x-content-source",
    );
    if (source) probes.push({ url: page.url, source });
  }
  if (probes.length === 0) {
    report.failures.push(
      `landing: none of ${SOURCE_PROBES} public pages sent x-content-source, so the check can't tell whether landing reads api_v2`,
    );
    return;
  }
  if (probes.every((probe) => probe.source === "static")) {
    report.notes.push(
      "landing skipped: it serves static content (x-content-source: static), not api_v2 yet",
    );
    return;
  }
  // A matching ?preview= sets the `preview` cookie (only the level, no
  // secret) and redirects to the bare URL; a wrong one sets nothing.
  const grant = await get(
    `${landing}${probes[0].url}?preview=${encodeURIComponent(token)}`,
  );
  const granted = grant.headers
    .getSetCookie()
    .some((cookie) => /^preview=preview(;|$)/.test(cookie));
  if (!granted) {
    report.failures.push(
      `landing refused the preview token (?preview= on ${probes[0].url} gave HTTP ${grant.status} and no preview cookie): its PREVIEW_SECRET differs from RECIPE_PREVIEW_TOKEN`,
    );
    return;
  }
  const preview = pages.find((page) => page.visibility === "preview");
  if (!preview) {
    report.notes.push(
      "landing accepts the preview token (no preview page to read through it)",
    );
    return;
  }
  const page = `${landing}${preview.url}`;
  const reviewer = await get(page, { cookie: "preview=preview" });
  const reviewerSource = reviewer.headers.get("x-content-source") ?? "none";
  if (reviewer.status !== 200 || reviewerSource !== "api_v2") {
    report.failures.push(
      `landing accepted the preview token but did not serve ${preview.url} from api_v2 (HTTP ${reviewer.status}, x-content-source: ${reviewerSource}): api_v2 may refuse landing's PREVIEW_SECRET`,
    );
    return;
  }
  const without = await get(page);
  if (without.status !== 404) {
    report.failures.push(
      `landing serves preview page ${preview.url} without the token (HTTP ${without.status}, not 404)`,
    );
    return;
  }
  report.notes.push(`landing accepts the preview token (${preview.url})`);
}

/** Runs every check; a system that throws is reported, not fatal to the rest. */
export async function checkPreviewToken(
  targets: Targets,
  token: string,
  fetchImpl: Fetch = fetch,
  retryDelayMs = 5000,
): Promise<Report> {
  const report: Report = { failures: [], notes: [] };
  const get = retrying(fetchImpl, retryDelayMs);
  const guard = async (system: string, run: () => Promise<void>) => {
    try {
      await run();
    } catch (error) {
      report.failures.push(`${system}: ${(error as Error).message}`);
    }
  };
  let pages: CatalogPage[] | undefined;
  await guard("api_v2", async () => {
    pages = await checkApiV2(targets.apiV2, token, report, get);
  });
  await guard("api v1", () => checkApiV1(targets.apiV1, token, report, get));
  if (pages)
    await guard("landing", () =>
      checkLanding(targets.landing, token, pages!, report, get),
    );
  else
    report.notes.push(
      "landing skipped: it needs api_v2's catalog to find a page",
    );
  return report;
}

async function main(): Promise<void> {
  const { PREVIEW_TOKEN, API_V1_URL, API_V2_URL, LANDING_URL } = process.env;
  if (!API_V1_URL || !API_V2_URL || !LANDING_URL) {
    console.error(
      "::error::Missing env: API_V1_URL, API_V2_URL and LANDING_URL are required",
    );
    process.exit(1);
  }
  if (!PREVIEW_TOKEN) {
    console.error(
      "::error::PREVIEW_TOKEN is empty: set this environment's RECIPE_PREVIEW_TOKEN GitHub secret",
    );
    process.exit(1);
  }
  const report = await checkPreviewToken(
    { apiV1: API_V1_URL, apiV2: API_V2_URL, landing: LANDING_URL },
    PREVIEW_TOKEN,
  );
  for (const note of report.notes) console.log(note);
  for (const failure of report.failures)
    console.error(`::error title=Preview token mismatch::${failure}`);
  if (report.failures.length > 0) process.exit(1);
}

// Run only when executed directly, not when imported by the spec (see
// project-board-sync.ts for why this is not an env check).
if (require.main === module) {
  main().catch((error) => {
    console.error(`::error::${(error as Error).message}`);
    process.exit(1);
  });
}
