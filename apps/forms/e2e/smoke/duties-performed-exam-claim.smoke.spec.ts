/**
 * duties-performed-exam-claim.smoke.spec.ts
 *
 * Live, on-demand smoke test for the "Claim Form for Duties Performed During
 * Examinations" form (formId `duties-performed-exam-claim`, version 1.1.0).
 *
 * Drives the REAL deployed form (default: sandbox), fills every field with valid
 * data, SUBMITS FOR REAL, and asserts the confirmation screen. The form has an
 * email processor on `applicant-info.email`, so a green run emails
 * `testing@govtech.bb`.
 *
 * Like the other smoke specs this lives under e2e/smoke and runs only via
 * playwright.smoke.config.ts. Shared helpers live in ../helpers/smoke.
 *
 *   pnpm --filter @govtech-bb/forms test:smoke
 *   SMOKE_BASE_URL=https://forms.sandbox.alpha.gov.bb pnpm --filter @govtech-bb/forms test:smoke
 *
 * Notes (confirmed against the deployed sandbox renderer):
 *  - Field IDs are `${stepId}_${fieldId}`; the deployed form marks EVERY field
 *    required (recipe-vs-deployed drift), so the spec fills them all.
 *  - Sections B, C and D are repeatable steps rendered inline with an
 *    "Add another?" radio — fill one row and answer "No".
 *  - The per-section total steps (`section-b-total` etc.) and `claim-amount`
 *    are `number` inputs that the deployed form serves as required + editable
 *    (despite the recipe marking them readonly), so the spec fills them.
 *  - `section-b`'s row-number field (formerly the literal id `#`) is `row-no`
 *    since the #741/#745 migration kebab-cased every recipe field id — which
 *    also renamed the camelCase ids this spec fills (`firstName` →
 *    `first-name` etc.).
 */
import { faker } from "@faker-js/faker";
import { test, expect } from "@playwright/test";
import {
  STEP_TIMEOUT,
  advance,
  currentStep,
  expectStep,
  fillField,
  selectRadio,
  submitAndConfirm,
} from "../helpers/smoke";

const FORM_ID = "duties-performed-exam-claim";

test.describe("Duties Performed Exam Claim — Live Smoke", () => {
  test("submits the real form end-to-end and reaches the confirmation screen", async ({
    page,
  }) => {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();

    await page.goto(`/forms/${FORM_ID}`);
    await page.waitForURL((url) => !!url.searchParams.get("step"), {
      timeout: STEP_TIMEOUT,
    });

    // ─── Section A: Claimant Details ─────────────────────────────────────────
    let step = expectStep(page, "applicant-info");
    await fillField(page, step, "first-name", firstName);
    await fillField(page, step, "last-name", lastName);
    await fillField(page, step, "other-names", faker.person.middleName());
    await fillField(page, step, "id-number", faker.string.numeric(9));
    await fillField(page, step, "address", faker.location.streetAddress());
    await fillField(page, step, "parish", "St. Michael");
    await fillField(page, step, "email", "testing@govtech.bb");
    await fillField(page, step, "telephone", "246-418-1234");
    await fillField(page, step, "tamis-no", faker.string.numeric(9));
    await fillField(page, step, "supervisor", faker.person.fullName());
    await fillField(page, step, "nis-no", faker.string.numeric(9));
    await fillField(page, step, "exam-period", "May/June 2026");
    await fillField(page, step, "claim-period-from", "2026-05-01");
    await fillField(page, step, "claim-period-to", "2026-06-30");
    await advance(page, step);

    // ─── Section B: Duties Performed (repeatable) ────────────────────────────
    step = expectStep(page, "section-b", { exact: true });
    await fillField(page, step, "row-no", "01");
    await fillField(page, step, "date", "2026-05-10");
    await fillField(page, step, "centre", "Bridgetown Centre");
    await fillField(page, step, "role", "Invigilator");
    await fillField(page, step, "rate", "50");
    await fillField(page, step, "overtime-hrs", "10");
    await fillField(page, step, "subtotal", "100");
    await selectRadio(page, step, "addAnother", "no");
    await advance(page, step);

    // ─── Section B: Total ────────────────────────────────────────────────────
    step = expectStep(page, "section-b-total");
    await fillField(page, step, "section-b-total", "100");
    await advance(page, step);

    // ─── Section C: Practical Examination Setup (repeatable) ─────────────────
    step = expectStep(page, "section-c", { exact: true });
    await fillField(page, step, "date", "2026-05-12");
    await fillField(page, step, "centre", "Bridgetown Centre");
    await fillField(page, step, "subject", "Chemistry");
    await fillField(page, step, "total-candidates", "30");
    await fillField(page, step, "total-personnel", "10");
    await fillField(page, step, "subtotal", "200");
    await selectRadio(page, step, "addAnother", "no");
    await advance(page, step);

    // ─── Section C: Total ────────────────────────────────────────────────────
    step = expectStep(page, "section-c-total");
    await fillField(page, step, "section-c-total", "200");
    await advance(page, step);

    // ─── Section D: Reader/Writer/etc Duties (repeatable) ────────────────────
    step = expectStep(page, "section-d", { exact: true });
    await fillField(page, step, "date", "2026-05-15");
    await fillField(page, step, "centre", "Bridgetown Centre");
    await fillField(page, step, "subject", "English A");
    await fillField(page, step, "duties", "Reader");
    await fillField(page, step, "no-hours-passages", "03");
    await fillField(page, step, "subtotal", "150");
    await selectRadio(page, step, "addAnother", "no");
    await advance(page, step);

    // ─── Section D: Total ────────────────────────────────────────────────────
    step = expectStep(page, "section-d-total");
    await fillField(page, step, "section-d-total", "150");
    await advance(page, step);

    // ─── Section E: Payee Information ────────────────────────────────────────
    step = expectStep(page, "section-e");
    await fillField(page, step, "bank-branch", "Republic Bank / Broad St");
    await fillField(page, step, "name-on-account", `${firstName} ${lastName}`);
    await fillField(page, step, "account-no", faker.finance.accountNumber(10));
    await fillField(page, step, "bic-swift-no", faker.finance.bic());
    await fillField(page, step, "account-type", "Savings");
    await advance(page, step);

    // ─── Section F: Payment Declaration ──────────────────────────────────────
    step = expectStep(page, "section-f");
    await fillField(page, step, "claim-amount", "450");
    await fillField(
      page,
      step,
      "claimant-signature",
      `${firstName} ${lastName}`,
    );
    await fillField(page, step, "claimant-date", "2026-06-02");
    await advance(page, step);

    // ─── For Official Use Only ───────────────────────────────────────────────
    step = expectStep(page, "section-official");
    await fillField(page, step, "supervisor-signature", "I. M. Supervisor");
    await fillField(page, step, "supervisor-date", "2026-06-02");
    await fillField(page, step, "exam-verifier-signature", "E. X. Verifier");
    await fillField(page, step, "exam-verifier-date", "2026-06-02");
    await fillField(
      page,
      step,
      "accounting-officer-signature",
      "A. C. Officer",
    );
    await fillField(page, step, "accounting-officer-date", "2026-06-02");
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
