/**
 * Journey 3 (#3010): a feature-flag change reaches landing and forms.
 *
 * Runs post-deploy against sandbox (its own `playwright.journey.config.ts`, NOT
 * the smoke config — it must never be swept into `test:smoke`, which would flip
 * real sandbox status as a side effect) and gates the promotion to staging. A
 * misconfigured deploy silently broke this propagation once (#2029) and nothing
 * caught it — this is that catch.
 *
 * The journey, against a DEDICATED non-public test service (`e2e-maintenance-check`):
 *   1. Flip it to maintenance (`form_disabled`) via `PUT /service_status`.
 *   2. Landing shows the "under maintenance" banner on the service page.
 *   3. The forms app serves the form as unavailable ("Form not found").
 *   4. Flip it back to live (`enabled`) and confirm both look normal again.
 * A `finally` then resets it to `disabled` (its seeded preview state) so the test
 * service never rests in a citizen-visible `enabled`/public state — the AC's
 * "back to live" is proven by step 4; the resting state is hidden. The reset runs
 * even when an assertion fails, and logs if it could not.
 *
 * Visibility model: the test service is `preview`, invisible to citizens. The
 * landing assertions run with a `preview` cookie so the maintenance-state page is
 * viewable (an `enabled` service_status publishes the page; `form_disabled`/
 * `disabled` keep it preview). The forms assertions run WITHOUT a preview token,
 * so `effectiveVisibility` decides availability (enabled→public→loads;
 * form_disabled→maintenance→404 "Form not found").
 *
 * Timing / budget: landing serves `service_status` from a 60s per-instance cache,
 * so after a flip a landing reload can show the old state until that window
 * expires; each landing step therefore polls PAST the TTL. With two flips that
 * exceeds the issue's original "<2 min" target — there is no way to stay under 2m
 * without a production cache-bypass, which was dropped as unsafe (an unsigned
 * cookie would let any client force uncached reads and throttle the API, the very
 * #2029 failure this guards). The budget is sized to the real worst case
 * (~4 min), the relaxed "<2 min" target the issue owner agreed on #3010.
 *
 * Required env:
 *   E2E_API_BASE_URL         feature-flag API base (PUT /service_status)
 *   E2E_LANDING_URL          landing base URL
 *   SMOKE_BASE_URL           forms base URL
 *   E2E_SERVICE_STATUS_TOKEN GitHub user PAT authorised for PUT /service_status
 *   E2E_LANDING_SERVICE_PATH optional; defaults to /e2e-maintenance-check
 */
import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
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

// Each reload must out-wait landing's 60s status cache with margin: a worst-case
// attempt that starts just before the window expires still needs room to retry,
// so the budget sits comfortably above 60s and polls on a fixed short interval.
const PROPAGATION_TIMEOUT = 90_000;
const POLL_INTERVAL = 5_000;
// Per-load wait for the SPA (forms) / SSR (landing) to actually render before the
// check decides — a one-off isVisible() would race the client-rendered forms app.
const RENDER_TIMEOUT = 8_000;

/** True once `locator` is actually visible within the per-load budget. */
function becomesVisible(locator: Locator): Promise<boolean> {
  return locator
    .waitFor({ state: "visible", timeout: RENDER_TIMEOUT })
    .then(() => true)
    .catch(() => false);
}

/** Reload `url` until `check` holds (absorbs the cache window + SPA render). */
async function reloadUntil(
  page: Page,
  url: string,
  check: () => Promise<boolean>,
): Promise<void> {
  await expect
    .poll(
      async () => {
        await page.goto(url, { waitUntil: "domcontentloaded" });
        return check();
      },
      { timeout: PROPAGATION_TIMEOUT, intervals: [POLL_INTERVAL] },
    )
    .toBe(true);
}

test.describe("Journey 3 — feature-flag maintenance reaches landing + forms", () => {
  test("flips a test service to maintenance and back, across both apps", async ({
    browser,
  }) => {
    test.setTimeout(240_000); // ~4 min — two flips past landing's 60s cache (#3010 AC, agreed with the issue owner)

    const api = required("E2E_API_BASE_URL");
    const landingUrl = required("E2E_LANDING_URL");
    const formsUrl = required("SMOKE_BASE_URL");
    const token = required("E2E_SERVICE_STATUS_TOKEN");
    const servicePage =
      landingUrl.replace(/\/$/, "") +
      (process.env.E2E_LANDING_SERVICE_PATH ?? `/${SERVICE}`);
    const formPage = `${formsUrl.replace(/\/$/, "")}/forms/${SERVICE}`;

    // A `preview` cookie makes the (preview) test page viewable on landing.
    const context = await browser.newContext();
    await context.addCookies([
      { name: "preview", value: "preview", url: landingUrl },
    ]);
    const page = await context.newPage();

    const maintenanceBanner = () => page.getByText(LANDING_MAINTENANCE_TEXT);
    const serviceHeading = () =>
      page.getByRole("heading", { name: /E2E maintenance check/i });
    const formHeading = () =>
      page.getByRole("heading", { name: "Your details" });
    const formNotFound = () => page.getByText(FORMS_NOT_FOUND_TEXT);

    let bodyError: unknown;
    try {
      // ─── 1. Maintenance ──────────────────────────────────────────────────
      await setServiceStatus(api, token, SERVICE, "form_disabled");

      await reloadUntil(page, servicePage, () =>
        becomesVisible(maintenanceBanner()),
      );
      await reloadUntil(page, formPage, () => becomesVisible(formNotFound()));

      // ─── 2. Back to live ─────────────────────────────────────────────────
      await setServiceStatus(api, token, SERVICE, "enabled");

      // Assert something POSITIVE (the page/form rendered), not just the absence
      // of the banner — absence alone also passes on a 404 or blank render.
      await reloadUntil(page, servicePage, async () => {
        const shown = await becomesVisible(serviceHeading());
        const noBanner = !(await maintenanceBanner()
          .isVisible()
          .catch(() => false));
        return shown && noBanner;
      });
      await reloadUntil(page, formPage, async () => {
        const loaded = await becomesVisible(formHeading());
        const noError = !(await formNotFound()
          .isVisible()
          .catch(() => false));
        return loaded && noError;
      });
    } catch (err) {
      bodyError = err;
    }

    // Always attempt to reset to the seeded `disabled` (→ preview) state so the
    // test service is never left citizen-visible.
    let resetError: unknown;
    try {
      await setServiceStatus(api, token, SERVICE, "disabled");
    } catch (err) {
      resetError = err;
    }
    await context.close();

    // Surface the original failure first — it's the most informative. But a reset
    // failure on an otherwise-green run must still go RED: a test service left
    // `enabled` is publicly listed, so a silent warning is not enough.
    if (bodyError) throw bodyError;
    if (resetError) {
      throw new Error(
        `J3 could not reset ${SERVICE} to disabled — it may be left enabled (public): ${resetError}`,
      );
    }
  });
});
