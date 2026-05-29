/**
 * vendor-registration.smoke.spec.ts
 *
 * Live, on-demand smoke test for the Smart Stream Vendor Registration form
 * (formId `smart-stream-vendor-registration`, version 1.1.0).
 *
 * It drives the REAL deployed form (default: the sandbox environment), fills
 * every step with valid @faker-js/faker data, SUBMITS FOR REAL, and asserts the
 * confirmation screen is reached with a reference number.
 *
 * This spec is deliberately isolated from the normal e2e suite:
 *  - It lives under e2e/smoke and is run via playwright.smoke.config.ts only.
 *  - playwright.config.ts (the CI/local suite) ignores the smoke directory, so
 *    this never runs in CI and never creates accidental real submissions.
 *
 * Run it on demand:
 *   pnpm --filter @govtech-bb/forms test:smoke
 *   SMOKE_BASE_URL=https://forms.alpha.gov.bb pnpm --filter @govtech-bb/forms test:smoke
 *
 * Notes from the as-built local walkthrough (against the same renderer):
 *  - DOM field IDs follow `${stepId}_${fieldId}`.
 *  - Step order: basic-info → classification → identification → contact-address
 *    → bank-details → check-your-answers (auto-injected) → declaration →
 *    submission-confirmation.
 *  - The masked NRN field must be typed character-by-character (fill() bypasses
 *    Maskito), so we use pressSequentially and assert the YYMMDD-NNNN shape.
 *  - account-type / vendor-classification radios have per-option IDs, so we
 *    select them by visible label via getByRole rather than FormPage.clickRadio
 *    (which assumes a shared radio ID).
 *  - declaration-date is isHidden and auto-populated — it is not interacted with
 *    and does not block submission.
 */
import { faker } from "@faker-js/faker";
import { test, expect, type Page } from "@playwright/test";

const FORM_ID = "smart-stream-vendor-registration";

/** Field IDs in the DOM follow the pattern `${stepId}_${fieldId}`. */
const fid = (stepId: string, fieldId: string) => `${stepId}_${fieldId}`;

/** The primary (Continue / Submit) button is shared across every step. */
const primaryButton = (page: Page) =>
  page.locator('button[data-variant="primary"]');

/** Wait until the URL `?step=` param equals the given step ID. */
async function waitForStep(page: Page, stepId: string): Promise<void> {
  await page.waitForURL((url) => url.searchParams.get("step") === stepId, {
    timeout: 15_000,
  });
}

/**
 * Build a complete, valid set of vendor-registration answers from faker.
 * Every value satisfies the validation rules in the 1.1.0 form definition.
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
    // Use the reserved example.com domain so the confirmation email never
    // reaches a real inbox.
    vendorEmail: faker.internet.email({ provider: "example.com" }),
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

    // ─── Step 1: Basic Information ───────────────────────────────────────────
    await page.goto(`/forms/${FORM_ID}?step=basic-info`);
    await waitForStep(page, "basic-info");
    await expect(page.locator("h1")).toContainText("Basic Information");

    await page
      .locator(`input[id="${fid("basic-info", "min-dept")}"]`)
      .fill(data.minDept);
    await page
      .locator(`input[id="${fid("basic-info", "vendor-name")}"]`)
      .fill(data.vendorName);
    await primaryButton(page).click();

    // ─── Step 2: Vendor Classification ───────────────────────────────────────
    await waitForStep(page, "classification");
    await page.getByRole("radio", { name: data.classification }).check();
    await primaryButton(page).click();

    // ─── Step 3: Identification Numbers ──────────────────────────────────────
    await waitForStep(page, "identification");
    await page
      .locator(`input[id="${fid("identification", "tamis-number")}"]`)
      .fill(data.tamisNumber);
    await page
      .locator(`input[id="${fid("identification", "company-reg-number")}"]`)
      .fill(data.companyRegNumber);
    await page
      .locator(`input[id="${fid("identification", "sba-number")}"]`)
      .fill(data.sbaNumber);
    // Masked field: type the raw digits so Maskito formats to YYMMDD-NNNN.
    const nrn = page.locator(`input[id="${fid("identification", "nrn")}"]`);
    await nrn.pressSequentially(data.nrnDigits);
    await expect(nrn).toHaveValue(/^\d{6}-\d{4}$/);
    await primaryButton(page).click();

    // ─── Step 4: Contact and Address Information ─────────────────────────────
    await waitForStep(page, "contact-address");
    await page
      .locator(`input[id="${fid("contact-address", "vendor-address-line-1")}"]`)
      .fill(data.addressLine1);
    await page
      .locator(`input[id="${fid("contact-address", "vendor-address-line-2")}"]`)
      .fill(data.addressLine2);
    await page
      .locator(`input[id="${fid("contact-address", "vendor-email")}"]`)
      .fill(data.vendorEmail);
    await primaryButton(page).click();

    // ─── Step 5: Bank Account Details ────────────────────────────────────────
    await waitForStep(page, "bank-details");
    await page
      .locator(`input[id="${fid("bank-details", "bank-name")}"]`)
      .fill(data.bankName);
    await page
      .locator(`input[id="${fid("bank-details", "bank-account-number")}"]`)
      .fill(data.bankAccountNumber);
    await page
      .locator(`input[id="${fid("bank-details", "branch-name")}"]`)
      .fill(data.branchName);
    await page
      .locator(`input[id="${fid("bank-details", "name-on-account")}"]`)
      .fill(data.nameOnAccount);
    await page.getByRole("radio", { name: data.accountType }).check();
    await page
      .locator(`input[id="${fid("bank-details", "bic-swift")}"]`)
      .fill(data.bicSwift);
    await page
      .locator(`input[id="${fid("bank-details", "bank-address")}"]`)
      .fill(data.bankAddress);
    await primaryButton(page).click();

    // ─── Check Your Answers (auto-injected) ──────────────────────────────────
    await waitForStep(page, "check-your-answers");
    await expect(page.locator("h1")).toContainText("Check your answers");
    // The summary should reflect what we entered.
    await expect(page.getByText(data.vendorName).first()).toBeVisible();
    await expect(page.getByText(data.vendorEmail)).toBeVisible();
    await primaryButton(page).click();

    // ─── Step 6: Declaration ─────────────────────────────────────────────────
    await waitForStep(page, "declaration");
    await page
      .getByRole("checkbox", { name: /I confirm that my information/ })
      .check();

    // Assert the real submission API call succeeds (HTTP 2xx) when we submit.
    const submissionResponse = page.waitForResponse(
      (res) =>
        res.url().includes("/submissions") && res.request().method() === "POST",
    );
    await primaryButton(page).click();

    const response = await submissionResponse;
    expect(
      response.ok(),
      `POST /submissions failed with ${response.status()}`,
    ).toBe(true);

    // ─── Submission Confirmation ─────────────────────────────────────────────
    await waitForStep(page, "submission-confirmation");
    await expect(page.locator("h1")).toContainText("Application Submitted");
    await expect(
      page.getByText("Your submission has been saved"),
    ).toBeVisible();
    await expect(page.getByText("Reference Number")).toBeVisible();

    // The API returns the reference as a UUID — assert one is rendered.
    const body = await response.json();
    const referenceId = body?.data?.id ?? body?.id;
    expect(
      referenceId,
      "submission response should include a reference id",
    ).toBeTruthy();
    await expect(page.getByText(String(referenceId))).toBeVisible();
  });
});
