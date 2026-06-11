/**
 * cape-exam-registration-2024.smoke.spec.ts
 *
 * Live, on-demand smoke test for the "Registration of Private Candidates for
 * May/June CAPE Examination" form (formId `cape-exam-registration-2024`,
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
 * Structurally a sibling of the CSEC form:
 *  - `gender` optional radio; `date-of-birth` three-part past date; `id-number`
 *    masked `999999-9999`; `parish` native <select> (slug); email / telephone
 *    formats enforced.
 *  - `subject-registration` is repeatable (min 1) and adds a `unit` field;
 *    alternative/resit are optional checkboxes. Fill one row, answer
 *    "Add another?" No.
 *  - The `declaration` step gates Submit behind a confirmation checkbox
 *    (`declaration-date` is optional and left blank).
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

const FORM_ID = "cape-exam-registration-2024";

test.describe("CAPE Exam Registration — Live Smoke", () => {
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
    await fillField(page, step, "first-name", firstName);
    await fillField(page, step, "last-name", lastName);
    // `gender` is an optional radio — skipped (interacting with it under slowMo
    // races the re-render and isn't needed to submit).
    await fillDate(page, step, "date-of-birth", 12, 8, 2001);
    await fillField(page, step, "id-number", "850101-0001");
    await fillField(page, step, "address", faker.location.streetAddress());
    await selectDropdown(page, step, "parish", "christ-church");
    await fillField(page, step, "email", "testing@govtech.bb");
    await fillField(page, step, "telephone-no", "246-418-1234");
    await advance(page, step);

    // ─── Subject Registration (repeatable) ───────────────────────────────────
    step = expectStep(page, "subject-registration", { exact: true });
    await fillField(page, step, "subject", "Pure Mathematics");
    await fillField(page, step, "unit", "Unit 1");
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
    await submitAndConfirm(page, {
      heading: "Your application has been submitted",
      subheading:
        "Your application to sit CAPE exams as a private candidate has been submitted.",
    });
  });
});
