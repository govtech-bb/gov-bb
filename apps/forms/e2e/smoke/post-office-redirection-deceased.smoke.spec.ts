/**
 * post-office-redirection-deceased.smoke.spec.ts
 *
 * Live, on-demand smoke test for the "Tell the Post Office someone has died"
 * form (formId `post-office-redirection-deceased`, version 1.2.0).
 *
 * Drives the REAL deployed form (default: sandbox), fills every visible/required
 * field with valid data, SUBMITS FOR REAL, and asserts the confirmation screen.
 * The form has an email processor on `applicant-details.applicant-email`
 * (recipe `recipientField: applicant-relationship.applicant-email` — see note
 * below), so a green run emails the address entered there.
 *
 * Like the other smoke specs this lives under e2e/smoke and runs only via
 * playwright.smoke.config.ts. Shared helpers live in ../helpers/smoke.
 *
 *   pnpm --filter @govtech-bb/forms test:smoke
 *   SMOKE_BASE_URL=https://forms.sandbox.alpha.gov.bb pnpm --filter @govtech-bb/forms test:smoke
 *
 * Notes (from the 1.2.0 recipe contract):
 *  - Field IDs are `${stepId}_${fieldId}`.
 *  - `deceased-title` / `applicant-title` render as native `<select>` (Title
 *    registry component) — use `selectDropdown` with slug values ("mr").
 *  - `deceased-parish` / `new-parish` render as native `<select>` (Parish) —
 *    use `selectDropdown` with slug values ("st-michael").
 *  - The applicant's relationship field is the unoverridden `components/relationship`
 *    (fieldId `relationship`, a required `<select>`); `email` and `telephone`
 *    are the unoverridden registry components (fieldIds `email`, `telephone`).
 *  - `date-of-death`, `redirection-start-date`, `redirection-end-date` all use
 *    the `date-of-birth` registry component (three-part day/month/year widget).
 *    Date of death must be in the past (`pastOrToday`).
 *  - There are no repeatable steps and no conditional fields in this recipe.
 *  - Optional fields (middle names, address line 2, postcodes) are left blank.
 *  - The renderer auto-injects `check-your-answers` immediately before the
 *    explicit `declaration` step (see build-form.ts) — handled with the guarded
 *    advance below.
 *  - `declaration` is the explicit final step; its single-option checkbox input
 *    is `declaration_declaration-confirmed-confirmed`.
 */
import { faker } from "@faker-js/faker";
import { test, expect } from "@playwright/test";
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

const FORM_ID = "post-office-redirection-deceased";

test.describe("Post Office Mail Redirection (Deceased) — Live Smoke", () => {
  test("submits the real form end-to-end and reaches the confirmation screen", async ({
    page,
  }) => {
    await page.goto(`/forms/${FORM_ID}`);
    await page.waitForURL((url) => !!url.searchParams.get("step"), {
      timeout: STEP_TIMEOUT,
    });

    // ─── Tell us about the deceased ──────────────────────────────────────────
    let step = expectStep(page, "deceased-details", { exact: true });
    await expect(page.locator("h1")).toContainText(
      "Tell us about the deceased",
    );
    await selectDropdown(page, step, "deceased-title", "mr");
    await fillField(
      page,
      step,
      "deceased-first-name",
      faker.person.firstName(),
    );
    await fillField(page, step, "deceased-last-name", faker.person.lastName());
    // Date of death must be in the past.
    await fillDate(page, step, "date-of-death", 12, 3, 2024);
    await advance(page, step);

    // ─── Address of the deceased person ──────────────────────────────────────
    step = expectStep(page, "deceased-address", { exact: true });
    await fillField(
      page,
      step,
      "deceased-address-line-1",
      faker.location.streetAddress(),
    );
    await selectDropdown(page, step, "deceased-parish", "st-michael");
    await advance(page, step);

    // ─── Tell us about yourself ──────────────────────────────────────────────
    step = expectStep(page, "applicant-details", { exact: true });
    await selectDropdown(page, step, "applicant-title", "mrs");
    await fillField(
      page,
      step,
      "applicant-first-name",
      faker.person.firstName(),
    );
    await fillField(page, step, "applicant-last-name", faker.person.lastName());
    await selectDropdown(page, step, "relationship", "child");
    await fillField(page, step, "email", "testing@govtech.bb");
    await fillField(page, step, "telephone", "246-418-1234");
    await advance(page, step);

    // ─── Authority to act on behalf of the deceased ──────────────────────────
    step = expectStep(page, "permission-details", { exact: true });
    await fillField(
      page,
      step,
      "permission-details",
      "I am the executor of the estate and hold a grant of probate.",
    );
    await advance(page, step);

    // ─── Where should we redirect the mail? ──────────────────────────────────
    step = expectStep(page, "new-address", { exact: true });
    await fillField(
      page,
      step,
      "new-address-line-1",
      faker.location.streetAddress(),
    );
    await selectDropdown(page, step, "new-parish", "christ-church");
    // RECIPE QUIRK: redirection-start/end-date reuse the `date-of-birth`
    // component, which enforces a `past` rule on the deployed form — so future
    // dates are rejected with "Date of birth must be in the past". Supply past
    // dates (end after start) to satisfy the live validator.
    await fillDate(page, step, "redirection-start-date", 1, 3, 2024);
    await fillDate(page, step, "redirection-end-date", 1, 9, 2024);
    await advance(page, step);

    // ─── Check your answers (auto-injected before declaration, if present) ───
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
      heading: "Thank you for your request",
    });
  });
});
