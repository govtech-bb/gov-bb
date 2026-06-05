/**
 * statement-of-travelling-form.smoke.spec.ts
 *
 * Live, on-demand smoke test for the "Statement of Travelling Form"
 * (formId `statement-of-travelling-form`, version 1.2.0).
 *
 * Drives the REAL form (default: sandbox; pass SMOKE_BASE_URL to target a local
 * stack), fills every required field with valid data, SUBMITS FOR REAL, and
 * asserts the confirmation screen. The form has an email processor on
 * `applicant-info.email`, so a green run emails `testing@govtech.bb`.
 *
 * Lives under e2e/smoke and runs only via playwright.smoke.config.ts. Shared
 * helpers live in ../helpers/smoke.
 *
 *   pnpm --filter @govtech-bb/forms test:smoke
 *   SMOKE_BASE_URL=https://forms.sandbox.alpha.gov.bb pnpm --filter @govtech-bb/forms test:smoke
 *
 * Notes (v1.2.0):
 *  - applicant-info uses `first-name` / `last-name`, `id-number`
 *    (national-id-number, mask `999999-9999`), `email`, and `phone-number`
 *    (telephone, libphonenumber-validated).
 *  - `travel-details` is repeatable (min 1): fill one row, answer
 *    "Add another?" No.
 *  - `travel-rates` shows the rate table as the step description; only the
 *    numeric fields are inputs. `school-reference` is a readonly reference step
 *    (its info field is optional) — just advance.
 *  - The `declaration` step gates Submit behind a confirmation checkbox.
 */
import { faker } from "@faker-js/faker";
import { test } from "@playwright/test";
import {
  STEP_TIMEOUT,
  advance,
  currentStep,
  expectStep,
  fillField,
  selectRadio,
  submitAndConfirm,
} from "../helpers/smoke";

const FORM_ID = "statement-of-travelling-form";

test.describe("Statement of Travelling — Live Smoke", () => {
  test("submits the real form end-to-end and reaches the confirmation screen", async ({
    page,
  }) => {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();

    await page.goto(`/forms/${FORM_ID}`);
    await page.waitForURL((url) => !!url.searchParams.get("step"), {
      timeout: STEP_TIMEOUT,
    });

    // ─── Personal Information ────────────────────────────────────────────────
    let step = expectStep(page, "applicant-info");
    await fillField(page, step, "first-name", firstName);
    await fillField(page, step, "last-name", lastName);
    // `national-id-number` — masked `999999-9999` (optional, filled for coverage).
    await fillField(page, step, "id-number", "850101-0001");
    await fillField(page, step, "email", "testing@govtech.bb");
    // `telephone` — libphonenumber/max validates real ranges.
    await fillField(page, step, "phone-number", "246-418-1234");
    await advance(page, step);

    // ─── Travel Certification ────────────────────────────────────────────────
    step = expectStep(page, "travel-certification");
    await fillField(page, step, "certification-month", "May");
    await fillField(page, step, "certification-year", "2026");
    await fillField(
      page,
      step,
      "certification-statement",
      "I certify that the following travelling was performed on official duty.",
    );
    await advance(page, step);

    // ─── Travel Details (repeatable) ─────────────────────────────────────────
    step = expectStep(page, "travel-details", { exact: true });
    await fillField(page, step, "day", "1");
    await fillField(page, step, "distance-travelled", "40");
    await fillField(
      page,
      step,
      "particulars",
      "Bridgetown to St. Philip office",
    );
    await fillField(page, step, "num-passengers", "0");
    await selectRadio(page, step, "addAnother", "no");
    await advance(page, step);

    // ─── Travel Rates & Calculations (rate table is the step description) ────
    step = expectStep(page, "travel-rates");
    await fillField(page, step, "total-distance-travelled", "40");
    await fillField(page, step, "first320km-or-less", "102.40");
    await fillField(page, step, "remainder-over320km", "0");
    await fillField(page, step, "passenger-subtotal", "0");
    await fillField(page, step, "total-claimed", "102.40");
    await advance(page, step);

    // ─── School Distance Reference (readonly reference step) ─────────────────
    step = expectStep(page, "school-reference");
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
