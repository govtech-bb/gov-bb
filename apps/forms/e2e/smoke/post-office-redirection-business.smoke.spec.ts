/**
 * post-office-redirection-business.smoke.spec.ts
 *
 * Live, on-demand smoke test for the "Post Office Redirection - Business" form
 * (formId `post-office-redirection-business`, version 1.2.0).
 *
 * Drives the REAL deployed form (default: sandbox), fills every visible/required
 * field with valid data, SUBMITS FOR REAL, and asserts the confirmation screen.
 * The form has an email processor on `applicant-details.applicant-email`, so a
 * green run emails `testing@govtech.bb`.
 *
 * Like the other smoke specs this lives under e2e/smoke and runs only via
 * playwright.smoke.config.ts. Shared helpers live in ../helpers/smoke.
 *
 *   pnpm --filter @govtech-bb/forms test:smoke
 *   SMOKE_BASE_URL=https://forms.sandbox.alpha.gov.bb pnpm --filter @govtech-bb/forms test:smoke
 *
 * Notes (from the 1.2.0 recipe contract):
 *  - Field IDs are `${stepId}_${fieldId}` (kebab-case fieldIds).
 *  - `applicant-title` and the two `*-parish` fields render as native `<select>`
 *    (the `components/title` + `components/parish` registry defaults) — use
 *    `selectDropdown` with slug values ("mr", "st-michael").
 *  - `applicant-telephone` is `tel`; `applicant-email` is `email`; names,
 *    addresses, registration number and position are `text`.
 *  - `passport-toggle` is a show/hide toggle. Left OFF (default), it keeps the
 *    conditional `applicant-passport-number` hidden and the `applicant-id-number`
 *    field required (the `optionalIf passport-toggle === true` behaviour does not
 *    fire), so the spec fills the National ID number and never touches passport.
 *  - `registration-number` must be all digits (pattern `^[0-9]+$`, min 5).
 *  - `redirection-start-date` / `redirection-end-date` are three-part date
 *    widgets; start must be today-or-future and end must be after start.
 *  - `check-your-answers` is an explicit recipe step (guarded advance).
 *  - `declaration` is the explicit final step; its single-option checkbox input
 *    is `declaration_declaration-confirmed-confirmed`.
 *  - The confirmation step title is "Application submitted" and there is no
 *    confirmation `description`/processing message, so the default
 *    "Your submission has been saved" subheading applies (omitted here).
 */
import { faker } from "@faker-js/faker";
import { test } from "@playwright/test";
import {
  STEP_TIMEOUT,
  advance,
  currentStep,
  expectStep,
  fillDate,
  fillField,
  selectDropdown,
  submitAndConfirm,
} from "../helpers/smoke";

const FORM_ID = "post-office-redirection-business";

test.describe("Post Office Redirection (Business) — Live Smoke", () => {
  test("submits the real form end-to-end and reaches the confirmation screen", async ({
    page,
  }) => {
    await page.goto(`/forms/${FORM_ID}`);
    await page.waitForURL((url) => !!url.searchParams.get("step"), {
      timeout: STEP_TIMEOUT,
    });

    // ─── Applicant Details ───────────────────────────────────────────────────
    let step = expectStep(page, "applicant-details", { exact: true });
    await selectDropdown(page, step, "applicant-title", "mr");
    await fillField(
      page,
      step,
      "applicant-first-name",
      faker.person.firstName(),
    );
    await fillField(
      page,
      step,
      "applicant-middle-name",
      faker.person.middleName(),
    );
    await fillField(page, step, "applicant-last-name", faker.person.lastName());
    await fillField(
      page,
      step,
      "applicant-id-number",
      faker.string.numeric(10),
    );
    // Leave `passport-toggle` OFF: keeps passport-number hidden, ID required.
    await fillField(page, step, "applicant-email", "testing@govtech.bb");
    await fillField(page, step, "applicant-telephone", "246-418-1234");
    await advance(page, step);

    // ─── Business Name ───────────────────────────────────────────────────────
    step = expectStep(page, "business-name", { exact: true });
    // Use a deterministic, validator-safe name: business-name only accepts
    // letters, spaces, hyphens and apostrophes, but faker.company.name() can
    // emit commas / periods / "&" (e.g. "Oberbrunner, Nicolas and Rau"), which
    // randomly trips "Name must contain only letters, hyphens, or apostrophes".
    await fillField(page, step, "business-name", "Bridgetown Trading Company");
    await fillField(page, step, "registration-number", faker.string.numeric(8));
    await advance(page, step);

    // ─── Current Address of the Business ─────────────────────────────────────
    step = expectStep(page, "current-address", { exact: true });
    await fillField(
      page,
      step,
      "current-address-line-1",
      faker.location.streetAddress(),
    );
    await fillField(
      page,
      step,
      "current-address-line-2",
      faker.location.secondaryAddress(),
    );
    await selectDropdown(page, step, "current-address-parish", "st-michael");
    await fillField(page, step, "current-address-postcode", "BB17004");
    await advance(page, step);

    // ─── Position in the Business ────────────────────────────────────────────
    step = expectStep(page, "position-details", { exact: true });
    await fillField(page, step, "position-details", "Managing Director");
    await advance(page, step);

    // ─── New Address (redirect to) + redirection dates ───────────────────────
    step = expectStep(page, "new-address", { exact: true });
    await fillField(
      page,
      step,
      "new-address-line-1",
      faker.location.streetAddress(),
    );
    await fillField(
      page,
      step,
      "new-address-line-2",
      faker.location.secondaryAddress(),
    );
    await selectDropdown(page, step, "new-address-parish", "christ-church");
    await fillField(page, step, "new-address-postcode", "BB17004");
    // Start today-or-future; end after start.
    await fillDate(page, step, "redirection-start-date", 1, 9, 2026);
    await fillDate(page, step, "redirection-end-date", 1, 12, 2026);
    await advance(page, step);

    // ─── Check your answers (explicit recipe step) ───────────────────────────
    if (currentStep(page).includes("check-your-answers")) {
      await advance(page, "check-your-answers");
    }

    // ─── Declaration ─────────────────────────────────────────────────────────
    expectStep(page, "declaration", { exact: true });
    await page
      .locator(`input[id="declaration_declaration-confirmed-confirmed"]`)
      .check();

    // ─── Submit + Submission Confirmation ────────────────────────────────────
    await submitAndConfirm(page, {
      heading: "Application submitted",
    });
  });
});
