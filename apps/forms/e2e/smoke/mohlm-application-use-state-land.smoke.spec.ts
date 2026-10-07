/**
 * mohlm-application-use-state-land.smoke.spec.ts
 *
 * Live, on-demand smoke tests for "Apply to use land owned by the Government
 * of Barbados" (formId `mohlm-application-use-state-land`, #2914).
 *
 * These drive the REAL form, fill every step with valid data, SUBMIT FOR REAL,
 * and assert the confirmation screen is reached with a reference code.
 *
 * Like the other specs under e2e/smoke they run ONLY via
 * playwright.smoke.config.ts — the normal `test:e2e` / CI suite ignores this
 * directory (ADR 0027 / 0029). The recipe is `visibility: preview`, so it must
 * NOT be added to the post-deploy smoke matrix (#1842) — a non-public form 404s
 * there.
 *
 * Run them on demand (from apps/forms):
 *   SMOKE_BASE_URL=https://forms.sandbox.alpha.gov.bb PREVIEW_TOKEN=… \
 *     pnpm exec playwright test --config playwright.smoke.config.ts \
 *     mohlm-application-use-state-land
 *
 *   PREVIEW_TOKEN is REQUIRED while the recipe is visibility:preview (appended
 *   as ?preview=<token>); pass it on the command line so the secret never
 *   lands in the repo. A local API also needs the form in
 *   PREVIEW_SUBMISSION_FORM_IDS, or the preview submit is refused.
 *
 * The form's routes:
 *  - `who-are-you-applying-for` → `applying-for` (yourself | organisation).
 *    On "organisation" it reveals `has-permission`, and on "yes" to that,
 *    `relationship-to-organisation`.
 *  - `no-permission` shows only for organisation + no permission. Its one
 *    field is disabled and always fails validation, so Continue never leaves
 *    it — the applicant has to go back.
 *  - Yourself → `your-details` (name, National Registration Number — or a
 *    passport number via the `passport-toggle` show/hide, left off here —
 *    address). Organisation → `organisation-details` then `contact-person`.
 *    Both address blocks show `parish` for Barbados and a "State or region"
 *    text field (`*-town`) for any other country.
 *  - `how-should-we-contact-you` → email, telephone, optional mobile.
 *  - `tell-us-about-the-land` → `land-has-address`: yes reveals the address
 *    lines and optional more-location-details; no reveals optional `district`
 *    and required `location-description`. `land-parish` shows on either answer.
 *  - `how-do-you-want-to-use-the-land` → use, start date, `knows-duration`;
 *    "yes" reveals `end-date` (must be on or after the start date).
 *  - `upload-your-documents` → an optional photo. Skipped in both walks:
 *    uploads need the S3 presign flow, which does not run locally.
 *  - `check-your-answers`, `declaration`, `submission-confirmation`.
 *
 * Test 1 walks the self route with a land address; test 2 walks the
 * organisation route with an overseas organisation and no land address; test 3
 * checks that the no-permission step blocks.
 *
 * `title`, `country` and `parish` are native <select>s — use the option value
 * (slug), not the label. Phone numbers are fixed, known-assignable Barbados
 * numbers: the phone rule runs libphonenumber-js `.isValid()`.
 */
import { test, expect, type Page } from "@playwright/test";
import {
  STEP_TIMEOUT,
  openSmokeForm,
  advance,
  expectStep,
  fillDate,
  fillField,
  selectDropdown,
  selectRadio,
  submitAndConfirm,
} from "../helpers/smoke";

const FORM_ID = "mohlm-application-use-state-land";

/** A date `days` from today, as the day/month/year parts fillDate takes. */
function dateFromToday(days: number): [number, number, number] {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return [d.getDate(), d.getMonth() + 1, d.getFullYear()];
}

async function openForm(page: Page): Promise<void> {
  await openSmokeForm(page, FORM_ID);
  await page.waitForURL((url) => !!url.searchParams.get("step"), {
    timeout: STEP_TIMEOUT,
  });
}

/** Upload (skipped), check your answers, declaration, submit. */
async function finishAndSubmit(page: Page, expectOnCya: string): Promise<void> {
  let step = expectStep(page, "upload-your-documents", { exact: true });
  await expect(page.locator("h1")).toContainText("Upload your documents");
  // The photo is optional — advancing without one is the assertion.
  await advance(page, step);

  step = expectStep(page, "check-your-answers", { exact: true });
  await expect(page.locator("h1")).toContainText("Check your answers");
  await expect(page.getByText(expectOnCya).first()).toBeVisible();
  await advance(page, step);

  expectStep(page, "declaration", { exact: true });
  await page
    .locator(`fieldset[id="declaration_declaration-confirmed"]`)
    .getByRole("checkbox")
    .check();

  await submitAndConfirm(page, {
    heading: "Application submitted",
    referenceLabel: "Submission ID",
  });
}

test.describe("Apply to use state land — Live Smoke", () => {
  test("self route: Barbados address, land with an address, known duration", async ({
    page,
  }) => {
    await openForm(page);

    let step = expectStep(page, "who-are-you-applying-for", { exact: true });
    await selectRadio(page, step, "applying-for", "yourself");
    // The organisation follow-ups stay hidden on this route.
    await expect(
      page.locator(`fieldset[id="${step}_has-permission"]`),
    ).toBeHidden();
    await advance(page, step);

    step = expectStep(page, "your-details", { exact: true });
    await selectDropdown(page, step, "applicant-title", "ms");
    await fillField(page, step, "applicant-first-name", "Smoke");
    await fillField(page, step, "applicant-last-name", "Applicant");
    await fillField(page, step, "national-id-number", "870315-1234");
    await expect(
      page.locator(`[id="${step}_applicant-passport-number"]`),
    ).toBeHidden();
    await fillField(page, step, "applicant-address-line-1", "12 Bay Street");
    await selectDropdown(page, step, "applicant-country", "barbados");
    await selectDropdown(page, step, "applicant-parish", "st-michael");
    await expect(page.locator(`[id="${step}_applicant-town"]`)).toBeHidden();
    await fillField(page, step, "applicant-postal-code", "BB11000");
    await advance(page, step);

    step = expectStep(page, "how-should-we-contact-you", { exact: true });
    await fillField(page, step, "email", "testing@govtech.bb");
    await fillField(page, step, "telephone", "246-418-1234");
    await advance(page, step);

    step = expectStep(page, "tell-us-about-the-land", { exact: true });
    await selectRadio(page, step, "land-has-address", "yes");
    await fillField(page, step, "land-address-line-1", "Lot 4 Spring Garden");
    await selectDropdown(page, step, "land-parish", "st-michael");
    await fillField(
      page,
      step,
      "more-location-details",
      "Next to the old pasture, opposite the bus stop.",
    );
    await expect(
      page.locator(`[id="${step}_location-description"]`),
    ).toBeHidden();
    await advance(page, step);

    step = expectStep(page, "how-do-you-want-to-use-the-land", { exact: true });
    await fillField(page, step, "land-use", "Smoke test — a vegetable garden.");
    await fillDate(page, step, "start-date", ...dateFromToday(30));
    await selectRadio(page, step, "knows-duration", "yes");
    await fillDate(page, step, "end-date", ...dateFromToday(395));
    await advance(page, step);

    await finishAndSubmit(page, "Lot 4 Spring Garden");
  });

  test("organisation route: overseas organisation, land without an address, duration not known", async ({
    page,
  }) => {
    await openForm(page);

    let step = expectStep(page, "who-are-you-applying-for", { exact: true });
    await selectRadio(page, step, "applying-for", "organisation");
    await selectRadio(page, step, "has-permission", "yes");
    await fillField(page, step, "relationship-to-organisation", "Director");
    await advance(page, step);

    step = expectStep(page, "organisation-details", { exact: true });
    await fillField(page, step, "organisation-name", "Smoke Test Holdings");
    await fillField(
      page,
      step,
      "organisation-address-line-1",
      "100 Main Street",
    );
    await selectDropdown(page, step, "organisation-country", "canada");
    // Overseas: "State or region" replaces parish.
    await expect(
      page.locator(`[id="${step}_organisation-parish"]`),
    ).toBeHidden();
    await fillField(page, step, "organisation-town", "Ontario");
    await fillField(page, step, "organisation-postal-code", "M5V 2T6");
    await advance(page, step);

    step = expectStep(page, "contact-person", { exact: true });
    await selectDropdown(page, step, "contact-title", "mr");
    await fillField(page, step, "contact-first-name", "Smoke");
    await fillField(page, step, "contact-last-name", "Contact");
    await advance(page, step);

    step = expectStep(page, "how-should-we-contact-you", { exact: true });
    await fillField(page, step, "email", "testing@govtech.bb");
    await fillField(page, step, "telephone", "246-418-1234");
    await advance(page, step);

    step = expectStep(page, "tell-us-about-the-land", { exact: true });
    await selectRadio(page, step, "land-has-address", "no");
    await expect(
      page.locator(`[id="${step}_land-address-line-1"]`),
    ).toBeHidden();
    await selectDropdown(page, step, "land-parish", "st-philip");
    await fillField(page, step, "district", "Six Roads");
    await fillField(
      page,
      step,
      "location-description",
      "Open lot behind the Six Roads roundabout, near the gas station.",
    );
    await fillField(page, step, "gps-coordinates", "13.1132, -59.5988");
    await advance(page, step);

    step = expectStep(page, "how-do-you-want-to-use-the-land", { exact: true });
    await fillField(page, step, "land-use", "Smoke test — a weekend market.");
    await fillDate(page, step, "start-date", ...dateFromToday(60));
    await selectRadio(page, step, "knows-duration", "no-not-yet");
    await expect(page.locator(`input[id="${step}_end-date-day"]`)).toBeHidden();
    await advance(page, step);

    await finishAndSubmit(page, "Smoke Test Holdings");
  });

  test("organisation without permission is stopped", async ({ page }) => {
    await openForm(page);

    const first = expectStep(page, "who-are-you-applying-for", { exact: true });
    await selectRadio(page, first, "applying-for", "organisation");
    await selectRadio(page, first, "has-permission", "no");
    await expect(
      page.locator(`[id="${first}_relationship-to-organisation"]`),
    ).toBeHidden();
    await advance(page, first);

    const step = expectStep(page, "no-permission", { exact: true });
    await expect(page.locator("h1")).toContainText(
      "You need permission to apply for this organisation",
    );
    await page.getByRole("button", { name: /^Continue$/ }).click();
    await expect(page.locator(".govbb-error-summary")).toContainText(
      "You need permission from the organisation to continue",
      { timeout: STEP_TIMEOUT },
    );
    expectStep(page, step, { exact: true });
  });
});
