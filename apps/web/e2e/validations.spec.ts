/**
 * validations.spec.ts
 *
 * Negative test cases: each test triggers a specific validation rule defined
 * in the master service contract and asserts the correct error message.
 *
 * Coverage:
 *  - Required fields (text, select, radio, checkbox, date, file)
 *  - minLength / maxLength
 *  - Pattern (email, NINO, postcode, telephone, swift-code)
 *  - Email equality (confirm-email must match email)
 *  - Date: past-only, minYear, maxYear
 *  - Number: min / max
 *  - Checkbox: minSelection / maxSelection
 *  - File: type restriction, size limit, minItems / maxItems
 */
import { test, expect } from "@playwright/test";
import { FormPage } from "./helpers/form-page";
import {
  TEST_PNG,
  TEST_PNG_2,
  TEST_PNG_3,
  OVERSIZED_PNG,
  INVALID_TYPE_FILE,
} from "./helpers/test-data";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Navigate through steps 1–3 successfully so tests for later steps can focus
 * on a single validation without repeating all prior navigation.
 */
async function completeUntilStep4(form: FormPage) {
  await form.goto();
  await form.fillStep1();
  await form.clickContinue();
  await form.waitForStep("step-2-contact-information");
  await form.fillStep2();
  await form.clickContinue();
  await form.waitForStep("random-step");
  await form.clickContinue();
  await form.waitForStep("step-3-address-employment");
  await form.fillStep3();
  await form.clickContinue();
  await form.waitForStep("step-4-documents-uploads");
}

async function completeUntilStep5(form: FormPage) {
  await completeUntilStep4(form);
  await form.fillStep4(TEST_PNG, [TEST_PNG_2, TEST_PNG_3]);
  await form.clickContinue();
  await form.waitForStep("step-5-financial-information");
}

// ─── Step 1 validations ───────────────────────────────────────────────────────

test.describe("Step 1 — Personal Details validations", () => {
  test("required: first name shows error when blank", async ({ page }) => {
    const form = new FormPage(page);
    await form.goto();

    // Clear the pre-filled default first name and submit
    await page.locator("input#step-1-personal-details_first-name").fill("");
    await form.clickContinue();

    await form.expectError("First name is required");
    await expect(form.errorSummary).toBeVisible();
  });

  test("required: last name shows error when blank", async ({ page }) => {
    const form = new FormPage(page);
    await form.goto();
    await page.locator("input#step-1-personal-details_last-name").fill("");
    await form.clickContinue();
    await form.expectError("Last name is required");
  });

  test("minLength: first name shows error when too short", async ({ page }) => {
    const form = new FormPage(page);
    await form.goto();
    await form.fillText("step-1-personal-details_first-name", "J");
    await form.clickContinue();
    await form.expectError("First name must be at least 2 characters");
  });

  test("maxLength: first name shows error when too long", async ({ page }) => {
    const form = new FormPage(page);
    await form.goto();
    await form.fillText("step-1-personal-details_first-name", "A".repeat(51));
    await form.clickContinue();
    await form.expectError("First name must not exceed 50 characters");
  });

  test("pattern: first name rejects non-letter characters", async ({
    page,
  }) => {
    const form = new FormPage(page);
    await form.goto();
    await form.fillText("step-1-personal-details_first-name", "J0hn123");
    await form.clickContinue();
    await form.expectError(
      "First name can only contain letters, spaces, hyphens and apostrophes",
    );
  });

  test("radio: sex field is pre-selected and no error when valid option chosen", async ({
    page,
  }) => {
    const form = new FormPage(page);
    await form.goto();
    // The sex field has defaultValue:"female" — radio buttons cannot be
    // programmatically unselected via UI, so we verify instead that selecting
    // a different valid option ("Male") causes no sex-related error.
    await form.fillStep1({ sexLabel: "Male" });
    await form.clickContinue();
    // Navigating away from step 1 means no sex error was raised
    await form.waitForStep("step-2-contact-information");
  });

  test("date: future date of birth shows error", async ({ page }) => {
    const form = new FormPage(page);
    await form.goto();
    await form.fillDate("step-1-personal-details_date-of-birth", 1, 1, 2099);
    await form.clickContinue();
    await form.expectError("Date of birth must be in the past");
  });

  test("date: maxYear — under-18 shows error", async ({ page }) => {
    const form = new FormPage(page);
    await form.goto();
    // Year 2010 is after maxYear=2008 in the contract
    await form.fillDate("step-1-personal-details_date-of-birth", 1, 1, 2010);
    await form.clickContinue();
    await form.expectError("You must be at least 18 years old");
  });

  test("date: minYear — year before 1900 shows error", async ({ page }) => {
    const form = new FormPage(page);
    await form.goto();
    await form.fillDate("step-1-personal-details_date-of-birth", 1, 1, 1899);
    await form.clickContinue();
    await form.expectError("Please enter a valid year");
  });

  test("pattern: NINO format is enforced", async ({ page }) => {
    const form = new FormPage(page);
    await form.goto();
    await form.fillText("step-1-personal-details_nino", "INVALID");
    await form.clickContinue();
    await form.expectError("Please enter a valid National Insurance number");
  });
});

// ─── Step 2 validations ───────────────────────────────────────────────────────

test.describe("Step 2 — Contact Information validations", () => {
  test.beforeEach(async ({ page }) => {
    const form = new FormPage(page);
    await form.goto();
    await form.fillStep1();
    await form.clickContinue();
    await form.waitForStep("step-2-contact-information");
  });

  test("required: email shows error when blank", async ({ page }) => {
    const form = new FormPage(page);
    await page.locator("input#step-2-contact-information_email").fill("");
    await form.clickContinue();
    await form.expectError("Email address is required");
  });

  test("email: invalid email format shows error", async ({ page }) => {
    const form = new FormPage(page);
    await form.fillText("step-2-contact-information_email", "not-an-email");
    await form.clickContinue();
    await form.expectError("Please enter a valid email address");
  });

  test("equal: confirm-email mismatch shows error", async ({ page }) => {
    const form = new FormPage(page);
    await form.fillText("step-2-contact-information_email", "user@example.com");
    await form.fillText(
      "step-2-contact-information_confirm-email",
      "different@example.com",
    );
    await form.clickContinue();
    await form.expectError("Email addresses do not match");
  });

  test("pattern: invalid telephone format shows error", async ({ page }) => {
    const form = new FormPage(page);
    await form.fillText("step-2-contact-information_telephone", "abc");
    await form.clickContinue();
    await form.expectError("Please enter a valid phone number");
  });

  test("minSelection: can-contact-evening requires at least 2 selections", async ({
    page,
  }) => {
    const form = new FormPage(page);
    // The field defaults to ["afternoon"] (1 item), which is below minSelection=2.
    // Simply clicking Continue without adding a second option triggers the error.
    await form.clickContinue();
    await form.expectError("At least two options must be selected");
  });

  test("required: single-lonely-textbox is required", async ({ page }) => {
    const form = new FormPage(page);
    // Fill valid contact fields but skip the single checkbox
    await form.fillText("step-2-contact-information_email", "user@example.com");
    await form.fillText(
      "step-2-contact-information_confirm-email",
      "user@example.com",
    );
    await form.fillText("step-2-contact-information_telephone", "07712345678");
    await form.fillText("step-2-contact-information_mobile", "07712345679");
    await form.selectOption(
      "step-2-contact-information_preferred-contact",
      "email",
    );
    // Add a second contact timing to pass minSelection
    await form.clickCheckbox(
      "step-2-contact-information_can-contact-evening",
      "Morning",
    );
    // Do NOT check single-lonely-textbox
    await form.clickContinue();
    await form.expectError("This is required.");
  });
});

// ─── Step 3 validations ───────────────────────────────────────────────────────

test.describe("Step 3 — Address & Employment validations", () => {
  test.beforeEach(async ({ page }) => {
    const form = new FormPage(page);
    await form.goto();
    await form.fillStep1();
    await form.clickContinue();
    await form.waitForStep("step-2-contact-information");
    await form.fillStep2();
    await form.clickContinue();
    await form.waitForStep("random-step");
    await form.clickContinue();
    await form.waitForStep("step-3-address-employment");
  });

  test("required: current address shows error when blank", async ({ page }) => {
    const form = new FormPage(page);
    await form.clickContinue();
    await form.expectError("Current address is required");
  });

  test("minLength: address below 5 chars shows error", async ({ page }) => {
    const form = new FormPage(page);
    await form.fillText("step-3-address-employment_current-address", "12");
    await form.clickContinue();
    await form.expectError("Please enter a complete address");
  });

  test("pattern: invalid postcode format shows error", async ({ page }) => {
    const form = new FormPage(page);
    await form.fillText("step-3-address-employment_postcode", "INVALID");
    await form.clickContinue();
    await form.expectError("Please enter a valid BB postcode");
  });

  test("required: employer name required when employed", async ({ page }) => {
    const form = new FormPage(page);
    await form.fillText(
      "step-3-address-employment_current-address",
      "123 Test Street",
    );
    await form.fillText("step-3-address-employment_town", "London");
    await form.fillText("step-3-address-employment_postcode", "BB12345");
    await form.selectOption(
      "step-3-address-employment_employment-status",
      "employed",
    );
    // Do NOT fill employer-name
    await form.clickContinue();
    await form.expectError("Employer name is required");
  });

  test("min: annual-income below 0 shows error", async ({ page }) => {
    const form = new FormPage(page);
    await form.fillText(
      "step-3-address-employment_current-address",
      "123 Test Street",
    );
    await form.fillText("step-3-address-employment_town", "London");
    await form.fillText("step-3-address-employment_postcode", "BB12345");
    await form.selectOption(
      "step-3-address-employment_employment-status",
      "employed",
    );
    await form.fillText("step-3-address-employment_employer-name", "Acme");
    await form.fillText("step-3-address-employment_job-title", "Dev");
    await form.fillNumber("step-3-address-employment_annual-income", "-1");
    await form.clickContinue();
    await form.expectError("Income cannot be negative");
  });

  test("max: annual-income above 10M shows error", async ({ page }) => {
    const form = new FormPage(page);
    await form.fillText(
      "step-3-address-employment_current-address",
      "123 Test Street",
    );
    await form.fillText("step-3-address-employment_town", "London");
    await form.fillText("step-3-address-employment_postcode", "BB12345");
    await form.selectOption(
      "step-3-address-employment_employment-status",
      "employed",
    );
    await form.fillText("step-3-address-employment_employer-name", "Acme");
    await form.fillText("step-3-address-employment_job-title", "Dev");
    await form.fillNumber(
      "step-3-address-employment_annual-income",
      "99999999",
    );
    await form.clickContinue();
    await form.expectError("Please enter a realistic income figure");
  });
});

// ─── Step 4 validations ───────────────────────────────────────────────────────

test.describe("Step 4 — Document Uploads validations", () => {
  test.beforeEach(async ({ page }) => {
    const form = new FormPage(page);
    await completeUntilStep4(form);
  });

  test("required: upload-document shows error when no file uploaded", async ({
    page,
  }) => {
    const form = new FormPage(page);
    await form.clickContinue();
    await form.expectError("Please upload an identity document");
  });

  test("fileTypes: rejected MIME type shows error", async ({ page }) => {
    const form = new FormPage(page);
    await form.uploadFiles(
      "step-4-documents-uploads_upload-document",
      INVALID_TYPE_FILE,
    );
    await form.clickContinue();
    await form.expectError("Only PDF, JPG and PNG files are accepted");
  });

  test("itemMaxSize: file exceeding 5 MB shows error", async ({ page }) => {
    const form = new FormPage(page);
    await form.uploadFiles(
      "step-4-documents-uploads_upload-document",
      OVERSIZED_PNG,
    );
    await form.clickContinue();
    await form.expectError("File size must not exceed 5MB");
  });

  test("minItems: proof-of-address requires at least 2 files", async ({
    page,
  }) => {
    const form = new FormPage(page);
    // Upload only one file
    await form.uploadFiles(
      "step-4-documents-uploads_proof-of-address",
      TEST_PNG,
    );
    await form.clickContinue();
    await form.expectError("Please upload at least 2 documents");
  });

  test("maxItems: proof-of-address rejects more than 3 files", async ({
    page,
  }) => {
    const form = new FormPage(page);
    // Upload 4 files
    for (const f of [TEST_PNG, TEST_PNG_2, TEST_PNG_3, TEST_PNG]) {
      await form.uploadFiles("step-4-documents-uploads_proof-of-address", f);
    }
    await form.clickContinue();
    await form.expectError("You can upload a maximum of 3 documents");
  });
});

// ─── Step 5 validations ───────────────────────────────────────────────────────

test.describe("Step 5 — Financial Information validations", () => {
  test.beforeEach(async ({ page }) => {
    const form = new FormPage(page);
    await completeUntilStep5(form);
  });

  test("required: bank-name required when has-bank-account is checked", async ({
    page,
  }) => {
    const form = new FormPage(page);
    // has-bank-account defaults to "confirmed" — leave it
    // Do NOT fill bank-name
    await form.fillNumber(
      "step-5-financial-information_initial-deposit",
      "1000",
    );
    await form.clickRadio(
      "step-5-financial-information_fund-source",
      "Employment Income",
    );
    await form.clickContinue();
    await form.expectError("Bank name is required");
  });

  test("minLength: account-number too short shows error", async ({ page }) => {
    const form = new FormPage(page);
    await form.fillText("step-5-financial-information_bank-name", "Bank");
    await form.selectOption(
      "step-5-financial-information_account-type",
      "current",
    );
    await form.fillText("step-5-financial-information_account-number", "12"); // below min=4
    await form.fillText("step-5-financial-information_swift-code", "123456");
    await form.fillNumber(
      "step-5-financial-information_initial-deposit",
      "1000",
    );
    await form.clickRadio(
      "step-5-financial-information_fund-source",
      "Employment Income",
    );
    await form.clickContinue();
    await form.expectError("Account number must be at least 4 digits");
  });

  test("pattern: invalid swift-code shows error", async ({ page }) => {
    const form = new FormPage(page);
    await form.fillText("step-5-financial-information_bank-name", "Bank");
    await form.selectOption(
      "step-5-financial-information_account-type",
      "current",
    );
    await form.fillText(
      "step-5-financial-information_account-number",
      "12345678",
    );
    await form.fillText("step-5-financial-information_swift-code", "NOTVALID");
    await form.fillNumber(
      "step-5-financial-information_initial-deposit",
      "1000",
    );
    await form.clickRadio(
      "step-5-financial-information_fund-source",
      "Employment Income",
    );
    await form.clickContinue();
    await form.expectError("Please enter a valid 6-digit swift code");
  });

  test("min: initial-deposit below 100 shows error", async ({ page }) => {
    const form = new FormPage(page);
    await form.fillText("step-5-financial-information_bank-name", "Bank");
    await form.selectOption(
      "step-5-financial-information_account-type",
      "current",
    );
    await form.fillText(
      "step-5-financial-information_account-number",
      "12345678",
    );
    await form.fillText("step-5-financial-information_swift-code", "123456");
    await form.fillNumber("step-5-financial-information_initial-deposit", "50"); // below min=100
    await form.clickRadio(
      "step-5-financial-information_fund-source",
      "Employment Income",
    );
    await form.clickContinue();
    await form.expectError("Minimum deposit is $100");
  });

  test("max: initial-deposit above 100,000 shows error", async ({ page }) => {
    const form = new FormPage(page);
    await form.fillText("step-5-financial-information_bank-name", "Bank");
    await form.selectOption(
      "step-5-financial-information_account-type",
      "current",
    );
    await form.fillText(
      "step-5-financial-information_account-number",
      "12345678",
    );
    await form.fillText("step-5-financial-information_swift-code", "123456");
    await form.fillNumber(
      "step-5-financial-information_initial-deposit",
      "200000",
    ); // above max=100000
    await form.clickRadio(
      "step-5-financial-information_fund-source",
      "Employment Income",
    );
    await form.clickContinue();
    await form.expectError("Maximum deposit is $100,000");
  });

  test("required: no-account-reason required when bank account unchecked", async ({
    page,
  }) => {
    const form = new FormPage(page);
    // Uncheck has-bank-account (default is confirmed)
    await form.clickCheckbox(
      "step-5-financial-information_has-bank-account",
      "I do",
    );
    await form.fillNumber(
      "step-5-financial-information_initial-deposit",
      "1000",
    );
    await form.clickRadio(
      "step-5-financial-information_fund-source",
      "Employment Income",
    );
    await form.clickContinue();
    // The inline [data-error] is not rendered for conditionally-revealed fields;
    // the error appears in the error summary instead.
    await form.expectErrorSummaryContains("Please provide a reason");
  });
});
