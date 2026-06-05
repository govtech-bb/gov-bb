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
 * Notes:
 *  - v1.2.0 fixes the `business-exclusion-certify` certification checkbox, which
 *    in v1.1.0 had no options and so rendered no checkable input (an
 *    unsubmittable required field); it now carries a single `confirmed` option.
 *  - `travel-rates-info` and `school-reference-info` are readonly reference
 *    fields (rate table / school-distance note). v1.2.0 also makes them optional
 *    — as required readonly fields they were un-fillable and blocked their step —
 *    so the spec leaves them alone.
 *  - `travel-details` is repeatable (min 1): fill one row, answer
 *    "Add another?" No.
 *  - The official-use steps (examination / DPS / processing-officer) are
 *    required of the submitter in this recipe, so the spec fills them.
 *  - The trailing `declaration` step carries no fields — Submit posts directly.
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
    const fullName = faker.person.fullName();

    await page.goto(`/forms/${FORM_ID}`);
    await page.waitForURL((url) => !!url.searchParams.get("step"), {
      timeout: STEP_TIMEOUT,
    });

    // ─── Applicant Information ───────────────────────────────────────────────
    let step = expectStep(page, "applicant-info");
    await fillField(page, step, "name", fullName);
    await fillField(page, step, "id-number", faker.string.numeric(9));
    await fillField(page, step, "email", "testing@govtech.bb");
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

    // ─── Travel Rates (readonly reference fields preset) ─────────────────────
    step = expectStep(page, "travel-rates");
    await fillField(page, step, "total-distance-travelled", "40");
    await fillField(page, step, "first320km-or-less", "102.40");
    await fillField(page, step, "remainder-over320km", "0");
    await fillField(page, step, "passenger-subtotal", "0");
    await fillField(page, step, "total-claimed", "102.40");
    await advance(page, step);

    // ─── Certifications ──────────────────────────────────────────────────────
    step = expectStep(page, "certifications");
    await page
      .locator(`input[id="${step}_business-exclusion-certify-confirmed"]`)
      .check();
    await fillField(page, step, "applicant-signature", fullName);
    await fillField(page, step, "applicant-date", "05/06/2026");
    await advance(page, step);

    // ─── Official Examination ────────────────────────────────────────────────
    step = expectStep(page, "official-examination");
    await fillField(page, step, "examination-notes", "Checked and verified.");
    await fillField(page, step, "examination-signature", "E. X. Aminer");
    await fillField(page, step, "examination-date", "05/06/2026");
    await advance(page, step);

    // ─── DPS Approval ────────────────────────────────────────────────────────
    step = expectStep(page, "dps-approval");
    await fillField(page, step, "dps-signature", "D. P. Secretary");
    await fillField(page, step, "dps-date", "05/06/2026");
    await advance(page, step);

    // ─── Processing Officer ──────────────────────────────────────────────────
    step = expectStep(page, "processing-officer");
    await fillField(page, step, "processing-officer-signature", "P. O. Fficer");
    await fillField(page, step, "processing-officer-date", "05/06/2026");
    await advance(page, step);

    // ─── School Reference (readonly reference field preset) ──────────────────
    step = expectStep(page, "school-reference");
    await advance(page, step);

    // ─── Check your answers (auto-injected by the renderer, if present) ──────
    if (currentStep(page).includes("check-your-answers")) {
      await advance(page, "check-your-answers");
    }

    // ─── Declaration ─────────────────────────────────────────────────────────
    expectStep(page, "declaration", { exact: true });

    // ─── Submit + Submission Confirmation ────────────────────────────────────
    await submitAndConfirm(page, { heading: "Submission Confirmation" });
  });
});
