/**
 * vendor-registration.smoke.spec.ts
 *
 * Live, on-demand smoke test for the Smart Stream Vendor Registration form
 * (formId `smart-stream-vendor-registration`).
 *
 * It drives the REAL deployed form (default: the sandbox environment), fills
 * every step with valid @faker-js/faker data, SUBMITS FOR REAL, and asserts the
 * confirmation screen is reached with a reference number.
 *
 * This spec is deliberately isolated from the normal e2e suite:
 *  - It lives under e2e/smoke and is run via playwright.smoke.config.ts only.
 *  - playwright.config.ts (the CI/local suite) ignores the smoke directory, so
 *    this never runs in CI and never creates accidental real submissions.
 * Shared step/field helpers live in ../helpers/smoke.
 *
 * Run it on demand:
 *   pnpm --filter @govtech-bb/forms test:smoke
 *   SMOKE_BASE_URL=https://forms.alpha.gov.bb pnpm --filter @govtech-bb/forms test:smoke
 *
 * Step IDs are matched by substring (the smoke helper default): the deployed
 * sandbox form numbers its data steps (`step-1-basic-info`, …) while the local
 * recipe JSON uses bare IDs (`basic-info`, …). The field-ID *suffixes*
 * (`min-dept`, `vendor-name`, …) and the trailing steps (`check-your-answers`,
 * `declaration`, `submission-confirmation`) are identical in both, so the spec
 * reads the live step ID from the URL and builds field IDs from it.
 *
 * Other notes from the live walkthrough:
 *  - The masked NRN field must be typed character-by-character (fill() bypasses
 *    Maskito), so we use pressSequentially and assert the YYMMDD-NNNN shape.
 *  - vendor-classification / account-type radios have per-option IDs, so we
 *    select them by visible label via getByRole.
 *  - declaration-date is isHidden and auto-populated — not interacted with.
 */
import { faker } from "@faker-js/faker";
import { test, expect } from "@playwright/test";
import {
  STEP_TIMEOUT,
  advance,
  expectStep,
  fillField,
  submitAndConfirm,
} from "../helpers/smoke";

const FORM_ID = "smart-stream-vendor-registration";

/**
 * Build a complete, valid set of vendor-registration answers from faker.
 * The vendor name carries a timestamp so the real submission is traceable in
 * the target environment.
 */
function buildVendorData() {
  // NRN must match ^\d{6}-\d{4}$ (mask 999999-9999). Derive a plausible
  // YYMMDD from a birthdate plus a 4-digit serial; we type the 10 raw digits
  // and let Maskito insert the dash.
  const dob = faker.date.birthdate({ min: 21, max: 70, mode: "age" });
  const yy = String(dob.getFullYear()).slice(-2);
  const mm = String(dob.getMonth() + 1).padStart(2, "0");
  const dd = String(dob.getDate()).padStart(2, "0");
  const nrnDigits = `${yy}${mm}${dd}${faker.string.numeric(4)}`;

  // Timestamped so the resulting record is easy to find in the environment.
  const vendorName = `Smoke Test ${faker.company.name()} ${new Date().toISOString()}`;

  return {
    minDept: `${faker.commerce.department()} Department`,
    vendorName,
    classification: faker.helpers.arrayElement([
      "Individual",
      "Small Business",
      "Other Business",
      "Medium Size Business",
      "Large Business",
    ]),
    tamisNumber: faker.string.numeric(9),
    companyRegNumber: `CR-${faker.string.numeric(5)}`,
    sbaNumber: `SBA-${faker.string.numeric(4)}`,
    nrnDigits,
    addressLine1: faker.location.streetAddress(),
    addressLine2: `${faker.location.city()}, ${faker.location.county()}`,
    // Send the confirmation email to the monitored test inbox rather than a
    // fake address, so a real run can be verified end-to-end (incl. email).
    vendorEmail: "testing@govtech.bb",
    bankName: `${faker.company.name()} Bank`,
    bankAccountNumber: faker.finance.accountNumber(10),
    branchName: `${faker.location.street()} Branch`,
    nameOnAccount: "Smoke Test Vendor",
    accountType: faker.helpers.arrayElement(["Deposit", "Savings"]),
    bicSwift: faker.finance.bic(),
    bankAddress: faker.location.streetAddress(),
  };
}

test.describe("Smart Stream Vendor Registration — Live Smoke", () => {
  test("submits the real form end-to-end and reaches the confirmation screen", async ({
    page,
  }) => {
    const data = buildVendorData();

    // Land on step 1 — the step guard redirects a fresh session to the first
    // step, whatever its (possibly numbered) ID is.
    await page.goto(`/forms/${FORM_ID}`);
    await page.waitForURL((url) => !!url.searchParams.get("step"), {
      timeout: STEP_TIMEOUT,
    });

    // ─── Step 1: Basic Information ───────────────────────────────────────────
    let step = expectStep(page, "basic-info");
    await expect(page.locator("h1")).toContainText("Basic Information");
    await fillField(page, step, "min-dept", data.minDept);
    await fillField(page, step, "vendor-name", data.vendorName);
    await advance(page, step);

    // ─── Step 2: Vendor Classification ───────────────────────────────────────
    step = expectStep(page, "classification");
    await page.getByRole("radio", { name: data.classification }).check();
    await advance(page, step);

    // ─── Step 3: Identification Numbers ──────────────────────────────────────
    step = expectStep(page, "identification");
    await fillField(page, step, "tamis-number", data.tamisNumber);
    await fillField(page, step, "company-reg-number", data.companyRegNumber);
    await fillField(page, step, "sba-number", data.sbaNumber);
    // Masked field: type the raw digits so Maskito formats to YYMMDD-NNNN.
    const nrn = page.locator(`input[id="${step}_nrn"]`);
    await nrn.pressSequentially(data.nrnDigits);
    await expect(nrn).toHaveValue(/^\d{6}-\d{4}$/);
    await advance(page, step);

    // ─── Step 4: Contact and Address Information ─────────────────────────────
    step = expectStep(page, "contact-address");
    await fillField(page, step, "vendor-address-line-1", data.addressLine1);
    await fillField(page, step, "vendor-address-line-2", data.addressLine2);
    await fillField(page, step, "vendor-email", data.vendorEmail);
    await advance(page, step);

    // ─── Step 5: Bank Account Details ────────────────────────────────────────
    step = expectStep(page, "bank-details");
    await fillField(page, step, "bank-name", data.bankName);
    await fillField(page, step, "bank-account-number", data.bankAccountNumber);
    await fillField(page, step, "branch-name", data.branchName);
    await fillField(page, step, "name-on-account", data.nameOnAccount);
    await page.getByRole("radio", { name: data.accountType }).check();
    await fillField(page, step, "bic-swift", data.bicSwift);
    await fillField(page, step, "bank-address", data.bankAddress);
    await advance(page, step);

    // ─── Check Your Answers (auto-injected) ──────────────────────────────────
    step = expectStep(page, "check-your-answers");
    await expect(page.locator("h1")).toContainText("Check your answers");
    await expect(page.getByText(data.vendorName).first()).toBeVisible();
    await expect(page.getByText(data.vendorEmail)).toBeVisible();
    await advance(page, step);

    // ─── Declaration ─────────────────────────────────────────────────────────
    expectStep(page, "declaration");
    await page
      .getByRole("checkbox", { name: /I confirm that my information/ })
      .check();

    // ─── Submit + Submission Confirmation ────────────────────────────────────
    await submitAndConfirm(page, {
      heading: "Application Submitted",
      referenceLabel: "Submission ID",
    });
  });
});
