/**
 * textbook-grant-application.smoke.spec.ts
 *
 * Live, on-demand smoke test for the "Application for $100 Textbook Grant" form
 * (formId `textbook-grant-application`, version 1.1.0).
 *
 * Drives the REAL deployed form (default: sandbox), fills every field with valid
 * data, SUBMITS FOR REAL, and asserts the confirmation screen. The form has an
 * email processor on `applicant-info.email`, so a green run sends a confirmation
 * email to `testing@govtech.bb`.
 *
 * Like the other smoke specs this lives under e2e/smoke and runs only via
 * playwright.smoke.config.ts. Shared helpers live in ../helpers/smoke.
 *
 *   pnpm --filter @govtech-bb/forms test:smoke
 *   SMOKE_BASE_URL=https://forms.sandbox.alpha.gov.bb pnpm --filter @govtech-bb/forms test:smoke
 *
 * Notes (confirmed against the deployed sandbox renderer):
 *  - Field IDs are `${stepId}_${fieldId}`. The deployed form marks EVERY field
 *    required (recipe-vs-deployed drift), so the spec fills them all.
 *  - `gender` is a native <select> (options M/F/O); date fields render as plain
 *    text inputs.
 *  - `student-information` is a repeatable step rendered inline with an
 *    "Add another?" radio — fill one student and answer "No" to advance.
 */
import { faker } from "@faker-js/faker";
import { test, expect } from "@playwright/test";
import {
  STEP_TIMEOUT,
  advance,
  currentStep,
  expectStep,
  fillField,
  selectDropdown,
  selectRadio,
  submitAndConfirm,
} from "../helpers/smoke";

const FORM_ID = "textbook-grant-application";

test.describe("Textbook Grant Application — Live Smoke", () => {
  test("submits the real form end-to-end and reaches the confirmation screen", async ({
    page,
  }) => {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();

    await page.goto(`/forms/${FORM_ID}`);
    await page.waitForURL((url) => !!url.searchParams.get("step"), {
      timeout: STEP_TIMEOUT,
    });

    // ─── Parent/Guardian Information ─────────────────────────────────────────
    let step = expectStep(page, "applicant-info");
    await expect(page.locator("h1")).toContainText(
      "Parent/Guardian Information",
    );
    await fillField(page, step, "title", "Ms");
    await fillField(page, step, "firstName", firstName);
    await fillField(page, step, "lastName", lastName);
    await fillField(page, step, "otherNames", faker.person.middleName());
    await fillField(page, step, "idNumber", faker.string.numeric(9));
    await fillField(page, step, "homePhone", faker.string.numeric(10));
    await fillField(page, step, "cellPhone", faker.string.numeric(10));
    await fillField(page, step, "workPhone", faker.string.numeric(10));
    await fillField(page, step, "email", "testing@govtech.bb");
    await fillField(page, step, "address", faker.location.streetAddress());
    await fillField(page, step, "parish", "St. Michael");
    await fillField(page, step, "tamisNo", faker.string.numeric(9));
    await advance(page, step);

    // ─── Banking Information ─────────────────────────────────────────────────
    step = expectStep(page, "banking-information");
    await fillField(page, step, "bankBranch", "Republic Bank / Broad St");
    await fillField(page, step, "accountNo", faker.finance.accountNumber(10));
    await fillField(page, step, "accountType", "Savings");
    await fillField(page, step, "nameOnAcct", `${firstName} ${lastName}`);
    await advance(page, step);

    // ─── Student Information (repeatable) ────────────────────────────────────
    step = expectStep(page, "student-information");
    await fillField(page, step, "name", faker.person.fullName());
    await fillField(page, step, "idNumber", faker.string.numeric(9));
    await selectDropdown(page, step, "gender", "F");
    await fillField(page, step, "class", "Form 1");
    await fillField(page, step, "relation", "Daughter");
    await selectRadio(page, step, "addAnother", "no");
    await advance(page, step);

    // ─── Declaration and Signature ───────────────────────────────────────────
    step = expectStep(page, "declaration-and-signature", { exact: true });
    await fillField(page, step, "declaration", "1 child");
    await fillField(page, step, "parentSignature", `${firstName} ${lastName}`);
    await fillField(page, step, "parentDate", "2026-06-02");
    await advance(page, step);

    // ─── For Official Use Only ───────────────────────────────────────────────
    step = expectStep(page, "official-use");
    await fillField(page, step, "comments", "Verified.");
    await fillField(page, step, "principalSignature", "I. M. Principal");
    await fillField(page, step, "principalDate", "2026-06-02");
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
