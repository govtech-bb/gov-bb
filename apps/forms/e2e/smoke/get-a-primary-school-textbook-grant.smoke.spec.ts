/**
 * get-a-primary-school-textbook-grant.smoke.spec.ts
 *
 * Live, on-demand smoke test for the "Get a Primary School Textbook Grant" form
 * (formId `get-a-primary-school-textbook-grant`, version 1.2.0).
 *
 * Drives the REAL deployed form (default: sandbox), fills every required field
 * with valid data, SUBMITS FOR REAL, and asserts the confirmation screen. The
 * form has an email processor on `applicant-details.applicant-email`, so a green
 * run sends a confirmation email to `testing@govtech.bb`.
 *
 * Like the other smoke specs this lives under e2e/smoke and runs only via
 * playwright.smoke.config.ts. Shared helpers live in ../helpers/smoke.
 *
 *   pnpm --filter @govtech-bb/forms test:smoke
 *   SMOKE_BASE_URL=https://forms.sandbox.alpha.gov.bb pnpm --filter @govtech-bb/forms test:smoke
 *
 * Notes (from the recipe, confirmed against the deployed renderer):
 *  - Field IDs are `${stepId}_${fieldId}`.
 *  - `child-sex`, `is-parent-or-guardian`, `bank-account-type` are radios;
 *    `applicant-parish` is a native <select>.
 *  - The two passport fields are conditional on a `show-hide` toggle — left off,
 *    so the National ID is used and the passport inputs never render.
 *  - `relationship-description` is conditional on `is-parent-or-guardian == "no"`,
 *    so answering "yes" skips it (and the whole `guardian-details` step, which is
 *    `stepConditionalOn` the same answer).
 *  - v1.2.0 made `child-details` repeatable (min 1, max 5), so the renderer
 *    injects a required `addAnother` radio ("Do you have another child at the
 *    same school?") on the step — answered "no" to stay on the single-child
 *    path (#816).
 *  - National ID format is `######-####`; telephone is a Barbados-style number.
 *  - The renderer auto-injects a `check-your-answers` review step before
 *    `submission-confirmation`.
 */
import { faker } from "@faker-js/faker";
import { test, expect } from "@playwright/test";
import {
  advance,
  currentStep,
  expectStep,
  fillField,
  selectDropdown,
  selectRadio,
  STEP_TIMEOUT,
  submitAndConfirm,
} from "../helpers/smoke";

const FORM_ID = "get-a-primary-school-textbook-grant";

/** A National ID matching the `^\d{6}-\d{4}$` pattern. */
const nationalId = () =>
  `${faker.string.numeric(6)}-${faker.string.numeric(4)}`;

test.describe("Get a Primary School Textbook Grant — Live Smoke", () => {
  test("submits the real form end-to-end and reaches the confirmation screen", async ({
    page,
  }) => {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();

    await page.goto(`/forms/${FORM_ID}`);
    await page.waitForURL((url) => !!url.searchParams.get("step"), {
      timeout: STEP_TIMEOUT,
    });

    // ─── Tell us about the child ─────────────────────────────────────────────
    let step = expectStep(page, "child-details");
    await expect(page.locator("h1")).toContainText("Tell us about the child");
    await fillField(page, step, "child-first-name", faker.person.firstName());
    await fillField(page, step, "child-last-name", lastName);
    await fillField(page, step, "child-id-number", nationalId());
    await selectRadio(page, step, "child-sex", "female");
    await fillField(page, step, "child-school", "Bridgetown Primary School");
    await fillField(
      page,
      step,
      "child-principal-name",
      `${faker.person.firstName()} ${faker.person.lastName()}`,
    );
    await fillField(page, step, "child-class-number", "Class 4");
    await selectRadio(page, step, "is-parent-or-guardian", "yes");
    // Injected by the v1.2.0 repeatable behaviour — "no" keeps a single child.
    await selectRadio(page, step, "addAnother", "no");
    await advance(page, step);

    // ─── Tell us about yourself ──────────────────────────────────────────────
    step = expectStep(page, "applicant-details");
    await fillField(page, step, "applicant-first-name", firstName);
    await fillField(page, step, "applicant-last-name", lastName);
    await fillField(
      page,
      step,
      "applicant-address-1",
      faker.location.streetAddress(),
    );
    // Address line 2 is optional in the recipe but the deployed form renders it
    // required (recipe-vs-published drift) — fill it to satisfy both.
    await fillField(
      page,
      step,
      "applicant-address-2",
      faker.location.secondaryAddress(),
    );
    await selectDropdown(page, step, "applicant-parish", "st-michael");
    await fillField(page, step, "applicant-email", "testing@govtech.bb");
    await fillField(page, step, "applicant-telephone", "246-418-1234");
    await fillField(page, step, "applicant-id-number", nationalId());
    // `components/tamis-number` requires 10-15 digits.
    await fillField(
      page,
      step,
      "applicant-tamis-number",
      faker.string.numeric(10),
    );
    await advance(page, step);

    // ─── Bank account information ────────────────────────────────────────────
    step = expectStep(page, "bank-account");
    await fillField(
      page,
      step,
      "bank-account-holder-name",
      `${firstName} ${lastName}`,
    );
    await fillField(page, step, "bank-name", "Republic Bank");
    await fillField(
      page,
      step,
      "bank-account-number",
      faker.string.numeric(10),
    );
    await fillField(page, step, "bank-branch-name", "Broad Street");
    await fillField(page, step, "bank-branch-code", "001");
    await selectRadio(page, step, "bank-account-type", "savings");
    await advance(page, step);

    // ─── Check your answers (auto-injected review step before declaration) ───
    if (currentStep(page).includes("check-your-answers")) {
      step = expectStep(page, "check-your-answers");
      await expect(page.locator("h1")).toContainText("Check your answers");
      await advance(page, step);
    }

    // ─── Declaration ─────────────────────────────────────────────────────────
    expectStep(page, "declaration", { exact: true });
    await page
      .getByRole("checkbox", { name: /I confirm that my information/ })
      .check();

    // ─── Submit + Submission Confirmation ────────────────────────────────────
    await submitAndConfirm(page, {
      heading: "Your application has been submitted",
      subheading: "Thank you. We have received your application.",
    });
  });
});
