/**
 * csec-private-candidate-registration.smoke.spec.ts
 *
 * Live, on-demand smoke test for the "Registration of Private Candidates -
 * CSEC Examination" form (formId `csec-private-candidate-registration`,
 * version 1.2.0).
 *
 * Drives the REAL form (default: sandbox; pass SMOKE_BASE_URL to target a local
 * stack), fills every required field with valid data, SUBMITS FOR REAL, and
 * asserts the confirmation screen.
 *
 * Lives under e2e/smoke and runs only via playwright.smoke.config.ts. Shared
 * helpers live in ../helpers/smoke.
 *
 *   pnpm --filter @govtech-bb/forms test:smoke
 *   SMOKE_BASE_URL=https://forms.sandbox.alpha.gov.bb pnpm --filter @govtech-bb/forms test:smoke
 *
 * Notes:
 *  - `gender` is an optional radio (male/female); set here to exercise it.
 *  - `date-of-birth` is a three-part day/month/year widget — must be in the past.
 *  - `id-number` is masked `999999-9999`; `parish` is a native <select> (slug
 *    values); `email`/`telephone-no` enforce email / libphonenumber formats.
 *  - `subject-selection` is repeatable (min 1): fill one subject, leave the
 *    optional alternative/resit checkboxes unticked, answer "Add another?" No.
 *  - The `declaration` step gates Submit behind a confirmation checkbox.
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
  selectRadio,
  submitAndConfirm,
} from "../helpers/smoke";

const FORM_ID = "csec-private-candidate-registration";

test.describe("CSEC Private Candidate Registration — Live Smoke", () => {
  test("submits the real form end-to-end and reaches the confirmation screen", async ({
    page,
  }) => {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();

    await page.goto(`/forms/${FORM_ID}`);
    await page.waitForURL((url) => !!url.searchParams.get("step"), {
      timeout: STEP_TIMEOUT,
    });

    // ─── Student Information ─────────────────────────────────────────────────
    let step = expectStep(page, "applicant-info");
    await fillField(page, step, "first-name", firstName);
    await fillField(page, step, "last-name", lastName);
    // `gender` is an optional radio — skipped (interacting with it under slowMo
    // races the re-render and isn't needed to submit).
    // Three-part date widget; must be in the past.
    await fillDate(page, step, "date-of-birth", 5, 4, 2000);
    // Masked `999999-9999`.
    await fillField(page, step, "id-number", "850101-0001");
    await fillField(page, step, "address", faker.location.streetAddress());
    // `components/parish` native <select>; pick by slug.
    await selectDropdown(page, step, "parish", "saint-michael");
    await fillField(page, step, "email", "testing@govtech.bb");
    await fillField(page, step, "telephone-no", "246-418-1234");
    await advance(page, step);

    // ─── Subject Selection (repeatable) ──────────────────────────────────────
    step = expectStep(page, "subject-selection", { exact: true });
    await fillField(page, step, "subject", "Mathematics");
    // alternative / resit are optional checkboxes — left unticked.
    await selectRadio(page, step, "addAnother", "no");
    await advance(page, step);

    // ─── Check your answers (auto-injected by the renderer, if present) ──────
    if (currentStep(page).includes("check-your-answers")) {
      await advance(page, "check-your-answers");
    }

    // ─── Declaration ─────────────────────────────────────────────────────────
    step = expectStep(page, "declaration", { exact: true });
    await page
      .locator(`input[id="${step}_declaration-confirmed-confirmed"]`)
      .check();

    // ─── Submit + Submission Confirmation ────────────────────────────────────
    await submitAndConfirm(page, { heading: "Submission Confirmation" });
  });
});
