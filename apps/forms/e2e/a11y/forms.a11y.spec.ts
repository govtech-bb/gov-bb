/**
 * forms.a11y.spec.ts
 *
 * Live accessibility (axe) scan of the forms app's key shared UI. Run via
 * playwright.a11y.config.ts only (kept out of the normal e2e/CI unit run), it
 * LOADS AND SCANS pages in a real browser — it never fills or submits a form,
 * so it creates no submission rows and needs no smoke-submission token.
 *
 * Running in a real browser (unlike the jsdom jest-axe unit tests) is what
 * lets it catch colour-contrast, focus and layout issues the unit tests can't.
 *
 * First slice scans:
 *  - the first step of a PUBLIC form (exercises field rendering, labels,
 *    headings, landmarks, focus, contrast — the shared form UI), and
 *  - the not-found page (the shared ErrorPage component).
 *
 * The form MUST be public: the deployed frontend reads the sandbox/preview API,
 * which 404s non-public forms (#1646). `jobstart-plus-programme` is the same
 * public, upload-free form the preview smoke uses.
 *
 * Run it on demand:
 *   pnpm --filter @govtech-bb/forms test:a11y
 *   A11Y_BASE_URL=https://forms.alpha.gov.bb pnpm --filter @govtech-bb/forms test:a11y
 */
import { test } from "@playwright/test";
import { STEP_TIMEOUT } from "../helpers/smoke";
import { scanForA11y } from "../helpers/a11y";

const PUBLIC_FORM_ID = "jobstart-plus-programme";

test.describe("Forms app — live accessibility (axe) scan", () => {
  test("first step of a public form has no serious/critical a11y violations", async ({
    page,
  }) => {
    await page.goto(`/forms/${PUBLIC_FORM_ID}`);
    // The step guard redirects a fresh session to the first step (?step=…).
    await page.waitForURL((url) => !!url.searchParams.get("step"), {
      timeout: STEP_TIMEOUT,
    });
    await page
      .locator("h1")
      .waitFor({ state: "visible", timeout: STEP_TIMEOUT });
    await scanForA11y(page, `form ${PUBLIC_FORM_ID} (first step)`);
  });

  test("not-found page has no serious/critical a11y violations", async ({
    page,
  }) => {
    // Any non-matching route renders the root notFoundComponent (NotFound).
    await page.goto("/a11y-probe-nonexistent-route");
    await page
      .locator("h1")
      .waitFor({ state: "visible", timeout: STEP_TIMEOUT });
    await scanForA11y(page, "not-found page");
  });
});
