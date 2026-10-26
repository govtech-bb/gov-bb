/**
 * Journey 3 (#3010): a feature-flag change reaches landing and forms.
 *
 * Runs post-deploy against sandbox and gates the promotion to staging. A
 * misconfigured deploy silently broke this propagation once (#2029) and nothing
 * caught it — this is that catch.
 *
 * The journey, against a DEDICATED non-public test service (`e2e-maintenance-check`,
 * never a real service):
 *   1. Flip it to maintenance (`form_disabled`) via `PUT /service_status`.
 *   2. Landing shows the "under maintenance" banner on the service page.
 *   3. The forms app serves the form as unavailable ("Form not found").
 *   4. Flip it back to live (`enabled`) and confirm both look normal again.
 * A `finally` always resets it to live, even when an assertion fails (#3010 AC).
 *
 * Visibility model (see docs in the PR): the test service is `preview`, so it is
 * invisible to citizens everywhere. The landing assertions run with a `preview`
 * cookie so the page is viewable; the maintenance *banner* is driven by
 * `service_status` and renders for preview viewers too. The forms assertions run
 * WITHOUT a preview token, so the `service_status` override is what decides the
 * form's availability (enabled → public → loads; form_disabled → maintenance →
 * 404 "Form not found").
 *
 * Timing: landing caches `service_status` for 60s in prod, so each flip is
 * polled by reloading until it reflects. The budget is 2m15s (see setTimeout);
 * the two 60s cache windows make that tight — see the PR for the feasibility
 * note and the suggested landing cache-bypass if it proves flaky.
 *
 * Required env:
 *   E2E_API_BASE_URL         feature-flag API base (GET/PUT /service_status)
 *   E2E_LANDING_URL          landing base URL
 *   SMOKE_BASE_URL           forms base URL (shared smoke convention)
 *   E2E_SERVICE_STATUS_TOKEN GitHub user PAT authorised for PUT /service_status
 *   E2E_LANDING_SERVICE_PATH optional; defaults to /e2e-maintenance-check
 */
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { setServiceStatus } from "../helpers/service-status";

// slug === form_id === recipe formId for this service, so landing's
// form-disabled match (keyed by form_id) and the API row use one id.
const SERVICE = "e2e-maintenance-check";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Journey 3 needs ${name} to be set`);
  return value;
}

const LANDING_MAINTENANCE_TEXT =
  "This form is currently being upgraded to serve you better";
const FORMS_NOT_FOUND_TEXT = "Form not found";

// Reload until the page reflects the just-flipped status. Landing's 60s cache is
// the slow part, so the window is generous; forms reflects per-request.
const PROPAGATION_TIMEOUT = 70_000;

async function reloadUntil(
  page: Page,
  url: string,
  predicate: () => Promise<boolean>,
): Promise<void> {
  await expect
    .poll(
      async () => {
        await page.goto(url, { waitUntil: "domcontentloaded" });
        return predicate();
      },
      { timeout: PROPAGATION_TIMEOUT, intervals: [2_000, 5_000, 10_000] },
    )
    .toBe(true);
}

test.describe("Journey 3 — feature-flag maintenance reaches landing + forms", () => {
  test("flips a test service to maintenance and back, across both apps", async ({
    browser,
  }) => {
    test.setTimeout(135_000); // 2m15s (#3010)

    const api = required("E2E_API_BASE_URL");
    const landingUrl = required("E2E_LANDING_URL");
    const formsUrl = required("SMOKE_BASE_URL");
    const token = required("E2E_SERVICE_STATUS_TOKEN");
    const servicePage =
      landingUrl.replace(/\/$/, "") +
      (process.env.E2E_LANDING_SERVICE_PATH ?? `/${SERVICE}`);
    const formPage = `${formsUrl.replace(/\/$/, "")}/forms/${SERVICE}`;

    // A `preview` cookie makes the non-public test page viewable on landing.
    const context = await browser.newContext();
    await context.addCookies([
      { name: "preview", value: "preview", url: landingUrl },
    ]);
    const page = await context.newPage();

    try {
      // ─── 1. Maintenance ──────────────────────────────────────────────────
      await setServiceStatus(api, token, SERVICE, "form_disabled");

      await reloadUntil(page, servicePage, () =>
        page.getByText(LANDING_MAINTENANCE_TEXT).isVisible(),
      );
      await reloadUntil(page, formPage, () =>
        page.getByText(FORMS_NOT_FOUND_TEXT).isVisible(),
      );

      // ─── 2. Back to live ─────────────────────────────────────────────────
      await setServiceStatus(api, token, SERVICE, "enabled");

      await reloadUntil(page, servicePage, async () =>
        page
          .getByText(LANDING_MAINTENANCE_TEXT)
          .isVisible()
          .then((v) => !v),
      );
      await reloadUntil(page, formPage, async () => {
        const errored = await page.getByText(FORMS_NOT_FOUND_TEXT).isVisible();
        const loaded = await page
          .getByRole("heading", { name: "Your details" })
          .isVisible()
          .catch(() => false);
        return !errored && loaded;
      });
    } finally {
      // Always leave the test service live — even if an assertion above failed.
      await setServiceStatus(api, token, SERVICE, "enabled").catch(() => {});
      await context.close();
    }
  });
});
