/**
 * conditionals.spec.ts
 *
 * Tests for every conditional visibility rule in the master contract:
 *
 * Field-level (fieldConditionalOn):
 *   - national-id    → visible when nationality = "bb"
 *   - previous-address / previous-postcode → visible when has-previous-address checked
 *   - employer-name / job-title / annual-income → visible when employment-status ∈ [employed, self-employed]
 *   - bank-name / account-type / account-number / swift-code → visible when has-bank-account checked
 *   - no-account-reason → visible when has-bank-account NOT checked
 *   - fund-source-other → visible when fund-source = "other" (radio conditional reveal)
 *
 * Step-level (stepConditionalOn):
 *   - random-step → visible when telephone field has a value (operator: exists)
 */
import { test, expect } from "@playwright/test";
import { FormPage } from "./helpers/form-page";
import { TEST_PNG, TEST_PNG_2, TEST_PNG_3 } from "./helpers/test-data";

// ─── Step 1 field conditionals ────────────────────────────────────────────────

test.describe("Step 1 — national-id conditional", () => {
  test.beforeEach(async ({ page }) => {
    const form = new FormPage(page);
    await form.goto();
    await form.waitForStep("step-1-personal-details");
  });

  test("national-id is hidden when nationality is not Barbados", async ({
    page,
  }) => {
    const form = new FormPage(page);
    await form.selectOption("step-1-personal-details_nationality", "uk");
    await form.expectFieldHidden("step-1-personal-details_national-id");
  });

  test("national-id appears when nationality = Barbados", async ({ page }) => {
    const form = new FormPage(page);
    await form.selectOption("step-1-personal-details_nationality", "bb");
    await form.expectFieldVisible("step-1-personal-details_national-id");
  });

  test("national-id hides again when nationality changed away from Barbados", async ({
    page,
  }) => {
    const form = new FormPage(page);
    await form.selectOption("step-1-personal-details_nationality", "bb");
    await form.expectFieldVisible("step-1-personal-details_national-id");
    await form.selectOption("step-1-personal-details_nationality", "uk");
    await form.expectFieldHidden("step-1-personal-details_national-id");
  });

  test("national-id is validated only when visible", async ({ page }) => {
    const form = new FormPage(page);
    // nationality = uk → national-id hidden → no validation error for it
    await form.selectOption("step-1-personal-details_nationality", "uk");
    await form.fillStep1({ nationalityValue: "uk" });
    await form.clickContinue();
    // Should advance to step 2 without a national-id error
    await form.waitForStep("step-2-contact-information");
  });
});

// ─── Step 3 field conditionals ────────────────────────────────────────────────

test.describe("Step 3 — has-previous-address conditional", () => {
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

  test("previous-address is hidden by default", async ({ page }) => {
    const form = new FormPage(page);
    await form.expectFieldHidden("step-3-address-employment_previous-address");
    await form.expectFieldHidden("step-3-address-employment_previous-postcode");
  });

  test("previous-address appears when has-previous-address is checked", async ({
    page,
  }) => {
    const form = new FormPage(page);
    await form.clickCheckbox(
      "step-3-address-employment_has-previous-address",
      "I accept",
    );
    await form.expectFieldVisible("step-3-address-employment_previous-address");
    await form.expectFieldVisible(
      "step-3-address-employment_previous-postcode",
    );
  });

  test("previous-address hides again when checkbox is unchecked", async ({
    page,
  }) => {
    const form = new FormPage(page);
    await form.clickCheckbox(
      "step-3-address-employment_has-previous-address",
      "I accept",
    );
    await form.expectFieldVisible("step-3-address-employment_previous-address");
    await form.clickCheckbox(
      "step-3-address-employment_has-previous-address",
      "I accept",
    );
    await form.expectFieldHidden("step-3-address-employment_previous-address");
  });
});

test.describe("Step 3 — employment-status conditional (operator: in)", () => {
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

  test("employer-name / job-title / annual-income hidden for unemployed", async ({
    page,
  }) => {
    const form = new FormPage(page);
    await form.selectOption(
      "step-3-address-employment_employment-status",
      "unemployed",
    );
    await form.expectFieldHidden("step-3-address-employment_employer-name");
    await form.expectFieldHidden("step-3-address-employment_job-title");
    await form.expectFieldHidden("step-3-address-employment_annual-income");
  });

  test("employer-name / job-title / annual-income visible for employed", async ({
    page,
  }) => {
    const form = new FormPage(page);
    await form.selectOption(
      "step-3-address-employment_employment-status",
      "employed",
    );
    await form.expectFieldVisible("step-3-address-employment_employer-name");
    await form.expectFieldVisible("step-3-address-employment_job-title");
    await form.expectFieldVisible("step-3-address-employment_annual-income");
  });

  test("employer-name / job-title / annual-income visible for self-employed", async ({
    page,
  }) => {
    const form = new FormPage(page);
    await form.selectOption(
      "step-3-address-employment_employment-status",
      "self-employed",
    );
    await form.expectFieldVisible("step-3-address-employment_employer-name");
    await form.expectFieldVisible("step-3-address-employment_annual-income");
  });

  test("conditional fields hide when switching from employed to retired", async ({
    page,
  }) => {
    const form = new FormPage(page);
    await form.selectOption(
      "step-3-address-employment_employment-status",
      "employed",
    );
    await form.expectFieldVisible("step-3-address-employment_employer-name");
    await form.selectOption(
      "step-3-address-employment_employment-status",
      "retired",
    );
    await form.expectFieldHidden("step-3-address-employment_employer-name");
  });

  test("conditional fields do NOT validate when hidden (student status advances)", async ({
    page,
  }) => {
    const form = new FormPage(page);
    await form.fillText(
      "step-3-address-employment_current-address",
      "123 Test Street",
    );
    await form.fillText("step-3-address-employment_town", "London");
    await form.fillText("step-3-address-employment_postcode", "BB12345");
    await form.selectOption(
      "step-3-address-employment_employment-status",
      "student",
    );
    await form.clickContinue();
    // employer-name is hidden so its "required" rule should not fire
    await form.waitForStep("step-4-documents-uploads");
  });
});

// ─── Step 5 field conditionals ────────────────────────────────────────────────

test.describe("Step 5 — has-bank-account conditional", () => {
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
    await form.fillStep3();
    await form.clickContinue();
    await form.waitForStep("step-4-documents-uploads");
    await form.fillStep4(TEST_PNG, [TEST_PNG_2, TEST_PNG_3]);
    await form.clickContinue();
    await form.waitForStep("step-5-financial-information");
  });

  test("bank fields visible when has-bank-account is checked (default)", async ({
    page,
  }) => {
    const form = new FormPage(page);
    await form.expectFieldVisible("step-5-financial-information_bank-name");
    await form.expectFieldVisible("step-5-financial-information_account-type");
    await form.expectFieldVisible(
      "step-5-financial-information_account-number",
    );
    await form.expectFieldVisible("step-5-financial-information_swift-code");
    await form.expectFieldHidden(
      "step-5-financial-information_no-account-reason",
    );
  });

  test("no-account-reason visible when has-bank-account unchecked", async ({
    page,
  }) => {
    const form = new FormPage(page);
    await form.clickCheckbox(
      "step-5-financial-information_has-bank-account",
      "I do",
    );
    await form.expectFieldHidden("step-5-financial-information_bank-name");
    await form.expectFieldVisible(
      "step-5-financial-information_no-account-reason",
    );
  });

  test("fields toggle correctly when checkbox is toggled back", async ({
    page,
  }) => {
    const form = new FormPage(page);
    await form.clickCheckbox(
      "step-5-financial-information_has-bank-account",
      "I do",
    );
    await form.expectFieldVisible(
      "step-5-financial-information_no-account-reason",
    );
    // Re-check
    await form.clickCheckbox(
      "step-5-financial-information_has-bank-account",
      "I do",
    );
    await form.expectFieldHidden(
      "step-5-financial-information_no-account-reason",
    );
    await form.expectFieldVisible("step-5-financial-information_bank-name");
  });
});

test.describe("Step 5 — fund-source radio conditional reveal", () => {
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
    await form.fillStep3();
    await form.clickContinue();
    await form.waitForStep("step-4-documents-uploads");
    await form.fillStep4(TEST_PNG, [TEST_PNG_2, TEST_PNG_3]);
    await form.clickContinue();
    await form.waitForStep("step-5-financial-information");
  });

  test("fund-source-other hidden when non-other option selected", async ({
    page,
  }) => {
    const form = new FormPage(page);
    await form.clickRadio(
      "step-5-financial-information_fund-source",
      "Employment Income",
    );
    await form.expectFieldHidden(
      "step-5-financial-information_fund-source-other",
    );
  });

  test("fund-source-other appears as inset field when Other selected", async ({
    page,
  }) => {
    const form = new FormPage(page);
    await form.clickRadio("step-5-financial-information_fund-source", "Other");
    await form.expectFieldVisible(
      "step-5-financial-information_fund-source-other",
    );
    // The inset field should be inside [data-radio-conditional]
    const inset = page.locator("[data-radio-conditional]");
    await expect(inset).toBeVisible();
  });

  test("fund-source-other hides when switching back to non-other", async ({
    page,
  }) => {
    const form = new FormPage(page);
    await form.clickRadio("step-5-financial-information_fund-source", "Other");
    await form.expectFieldVisible(
      "step-5-financial-information_fund-source-other",
    );
    await form.clickRadio(
      "step-5-financial-information_fund-source",
      "Savings",
    );
    await form.expectFieldHidden(
      "step-5-financial-information_fund-source-other",
    );
  });

  test("fund-source-other validates only when visible", async ({ page }) => {
    const form = new FormPage(page);
    // Select "Other" then fill the inset field
    await form.clickRadio("step-5-financial-information_fund-source", "Other");
    // Leave fund-source-other blank and try to continue
    await form.fillStep5Source({ fundSourceLabel: "Other" });
    // The "Other" radio has been clicked — inset field is visible but blank
    await form.clickContinue();
    await form.expectError("Please specify the source of funds");
  });
});

// ─── Step-level conditional (random-step) ────────────────────────────────────

test.describe("random-step — stepConditionalOn (operator: exists)", () => {
  test("random-step appears in navigation when telephone provided", async ({
    page,
  }) => {
    const form = new FormPage(page);
    await form.goto();
    await form.fillStep1();
    await form.clickContinue();
    await form.waitForStep("step-2-contact-information");

    // Provide a telephone — random-step condition: telephone exists
    await form.fillStep2({ telephone: "07712345678" });
    await form.clickContinue();

    // Must land on random-step
    await form.waitForStep("random-step");
  });
});
