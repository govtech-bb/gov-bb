/**
 * term-leave-application.smoke.spec.ts
 *
 * Live smoke test for the "Application for Term's Leave" form
 * (formId `term-leave-application`, version 1.3.0).
 *
 * It drives the REAL deployed form (default: the sandbox environment), fills
 * every step with valid data, SUBMITS FOR REAL, and asserts the confirmation
 * screen is reached with a reference number.
 *
 * Unlike temp-teacher-application.smoke.spec.ts this form has NO file uploads —
 * so the run needs no AWS credentials and no presign → S3 → confirm flow. The
 * only external effect of a green run is a real submission (the form has an
 * email processor on `applicant-info.email`, so the confirmation email goes to
 * `testing@govtech.bb`).
 *
 * This spec is deliberately isolated from the normal e2e suite:
 *  - It lives under e2e/smoke and is run via playwright.smoke.config.ts only.
 *  - playwright.config.ts (the CI/local mocked suite) ignores the smoke
 *    directory, so this never runs in `test:e2e` and never creates accidental
 *    real submissions.
 * Shared step/field helpers live in ../helpers/smoke.
 *
 * Run it on demand:
 *   pnpm --filter @govtech-bb/forms test:smoke
 *   SMOKE_BASE_URL=https://forms.sandbox.alpha.gov.bb pnpm --filter @govtech-bb/forms test:smoke
 *
 * Step IDs are matched by substring (the smoke helper default) so the spec stays
 * robust if a deployment ever renumbers its data steps; the field-ID suffixes
 * and the trailing steps (`check-your-answers`, `declaration`,
 * `submission-confirmation`) are stable.
 *
 * Changes in v1.3.0 (vs the v1.2.0 walkthrough this spec used to match):
 *  - The paper-form `applicant-signature` and `official-use` steps are gone —
 *    the applicant submits online; the principal's recommendation happens
 *    downstream, outside the form.
 *  - Dates are three-part day/month/year widgets (`components/generic-date`),
 *    not plain text inputs — filled via the `fillDate` helper.
 *  - `contactNo` is `components/telephone` and `idNumber` is
 *    `components/national-id-number` (mask `999999-9999`), so the test data
 *    must satisfy those formats.
 *  - The `declaration` step now gates Submit behind a confirmation checkbox
 *    (same pattern as temp-teacher / vendor-registration), alongside the
 *    auto-rendered applicant name + today's date (`.form-page__applicant`).
 *  - `leave-details.comments` is genuinely optional, but is still filled here
 *    to exercise the textarea.
 *
 * Field-id suffixes are kebab-case (`first-name`, not `firstName`) since the
 * #741/#745 recipe id migration kebab-cased every checked-in recipe version.
 */
import { faker } from "@faker-js/faker";
import { test, expect } from "@playwright/test";
import {
  STEP_TIMEOUT,
  advance,
  expectStep,
  fillDate,
  fillField,
  selectDropdown,
  selectRadio,
  submitAndConfirm,
} from "../helpers/smoke";

const FORM_ID = "term-leave-application";

test.describe("Term Leave Application — Live Smoke", () => {
  test("submits the real form end-to-end and reaches the confirmation screen", async ({
    page,
  }) => {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();

    await page.goto(`/forms/${FORM_ID}`);
    await page.waitForURL((url) => !!url.searchParams.get("step"), {
      timeout: STEP_TIMEOUT,
    });

    // ─── Applicant Information ───────────────────────────────────────────────
    let step = expectStep(page, "applicant-info");
    await expect(page.locator("h1")).toContainText("Applicant Information");
    // The published 1.3.0 recipe swapped `school` from a free-text input to a
    // school select (PrimarySchool registry component) — drive it by option
    // value, not fill().
    await selectDropdown(page, step, "school", "bay-primary-school");
    await fillField(page, step, "first-name", firstName);
    await fillField(page, step, "last-name", lastName);
    // `components/telephone` — phone-format validation.
    await fillField(page, step, "contact-no", "246-555-0123");
    // Send the confirmation email to the monitored test inbox, not a real person.
    await fillField(page, step, "email", "testing@govtech.bb");
    await fillField(page, step, "post", "Mathematics Teacher");
    // `components/national-id-number` — masked `999999-9999`.
    await fillField(page, step, "id-number", "850101-0001");
    await advance(page, step);

    // ─── Leave Details ───────────────────────────────────────────────────────
    step = expectStep(page, "leave-details");
    await fillDate(page, step, "leave-start-date", 1, 9, 2026);
    await fillDate(page, step, "leave-end-date", 15, 12, 2026);
    // Answer "No" so the conditional `previous-leave-details` field stays hidden.
    await selectRadio(page, step, "previous-leave-granted", "no");
    // Optional in v1.3.0; filled anyway to exercise the textarea.
    await fillField(page, step, "comments", "No additional comments.");
    await advance(page, step);

    // ─── Check Your Answers (auto-injected) ──────────────────────────────────
    step = expectStep(page, "check-your-answers");
    await expect(page.locator("h1")).toContainText("Check your answers");
    await expect(page.getByText(firstName).first()).toBeVisible();
    await advance(page, step);

    // ─── Declaration ─────────────────────────────────────────────────────────
    // The applicant's name and today's date (DD/MM/YYYY) auto-render read-only,
    // and Submit is gated behind the confirmation checkbox.
    expectStep(page, "declaration");
    const applicant = page.locator(".form-page__applicant");
    await expect(applicant).toContainText(`${firstName} ${lastName}`);
    await expect(applicant).toContainText(/\b\d{2}\/\d{2}\/\d{4}\b/);
    await page
      .locator(`input[id="declaration_declaration-confirmed-confirmed"]`)
      .check();

    // ─── Submit + Submission Confirmation ────────────────────────────────────
    await submitAndConfirm(page, {
      heading: "Submission Confirmation",
      referenceLabel: "Reference number",
    });
  });
});
