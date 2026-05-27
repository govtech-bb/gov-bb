/**
 * master-contract.spec.ts
 *
 * Happy-path end-to-end walkthrough of every step defined in
 * apps/forms/contracts/master-contract.json.
 *
 * Coverage:
 *  - All 7 form steps render and advance correctly
 *  - Check-Your-Answers reflects submitted data
 *  - Declaration / submit lands on the confirmation screen
 *  - Session state is preserved across navigation (back → forward)
 */
import { test, expect } from "@playwright/test";
import { FormPage } from "./helpers/form-page";
import { mockSuccessfulSubmission } from "./helpers/submission-mock";
import { TEST_PNG, TEST_PNG_2, TEST_PNG_3 } from "./helpers/test-data";

test.describe("Master Contract — Happy Path", () => {
  test.beforeEach(async ({ page }) => {
    await mockSuccessfulSubmission(page);
  });

  // ─── Step 1: Personal Details ───────────────────────────────────────────────

  test("Step 1 — renders personal-details fields and advances", async ({
    page,
  }) => {
    const form = new FormPage(page);
    await form.goto();

    await form.expectStepHeading("Personal Details");

    // All expected fields should be visible
    await expect(
      page.locator("select#step-1-personal-details_title"),
    ).toBeVisible();
    await expect(
      page.locator("input#step-1-personal-details_first-name"),
    ).toBeVisible();
    await expect(
      page.locator("input#step-1-personal-details_last-name"),
    ).toBeVisible();

    await form.fillStep1();
    await form.clickContinue();
    await form.waitForStep("step-2-contact-information");
  });

  // ─── Step 2: Contact Information ───────────────────────────────────────────

  test("Step 2 — renders contact fields and advances", async ({ page }) => {
    const form = new FormPage(page);
    await form.goto();

    await form.fillStep1();
    await form.clickContinue();
    await form.waitForStep("step-2-contact-information");

    await form.expectStepHeading("Contact Information");
    await expect(
      page.locator("input#step-2-contact-information_email"),
    ).toBeVisible();

    await form.fillStep2();
    await form.clickContinue();
    // Next step is random-step (conditional on telephone existing)
    await form.waitForStep("random-step");
  });

  // ─── Random Step (conditional step) ────────────────────────────────────────

  test("random-step — renders and advances when telephone was provided", async ({
    page,
  }) => {
    const form = new FormPage(page);
    await form.goto();

    await form.fillStep1();
    await form.clickContinue();
    await form.waitForStep("step-2-contact-information");
    await form.fillStep2();
    await form.clickContinue();
    await form.waitForStep("random-step");

    // Just continue — the step has one optional text field
    await form.fillRandomStep();
    await form.clickContinue();
    await form.waitForStep("step-3-address-employment");
  });

  // ─── Step 3: Address & Employment ──────────────────────────────────────────

  test("Step 3 — renders address/employment fields and advances", async ({
    page,
  }) => {
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

    await form.expectStepHeading("Address & Employment");
    await form.fillStep3();
    await form.clickContinue();
    await form.waitForStep("step-4-documents-uploads");
  });

  // ─── Step 4: Document Uploads ───────────────────────────────────────────────

  test("Step 4 — uploads files and advances", async ({ page }) => {
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

    await form.expectStepHeading("Documents & Uploads");

    await form.fillStep4(TEST_PNG, [TEST_PNG_2, TEST_PNG_3]);

    // Verify uploaded file names appear in the list
    await expect(
      page.locator(".govbb-file-upload__name").first(),
    ).toBeVisible();

    await form.clickContinue();
    await form.waitForStep("step-5-financial-information");
  });

  // ─── Step 5: Financial Information (source + repeat) ───────────────────────

  test("Step 5 — fills financial fields and advances through repeatable steps", async ({
    page,
  }) => {
    const form = new FormPage(page);
    await form.goto();

    // Navigate through steps 1–4 quickly
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

    await form.expectStepHeading("Financial Information");

    // Source step
    await form.fillStep5Source();
    await form.clickContinue();

    // First (and only) required repeat — answer "No" to "Add another?"
    await form.waitForStep("step-5-financial-information~1");
    await form.fillStep5Repeat("step-5-financial-information~1", {
      addAnotherAnswer: "No",
    });
    await form.clickContinue();
    await form.waitForStep("check-your-answers");
  });

  // ─── Check Your Answers ─────────────────────────────────────────────────────

  test("Check-Your-Answers — displays entered values and Change links", async ({
    page,
  }) => {
    const form = new FormPage(page);
    await form.goto();

    await form.fillStep1({ firstName: "Alice", lastName: "Walker" });
    await form.clickContinue();
    await form.waitForStep("step-2-contact-information");
    await form.fillStep2({ email: "alice@example.com" });
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
    await form.fillStep5Source();
    await form.clickContinue();
    await form.waitForStep("step-5-financial-information~1");
    await form.fillStep5Repeat("step-5-financial-information~1", {
      addAnotherAnswer: "No",
    });
    await form.clickContinue();
    await form.waitForStep("check-your-answers");

    await form.expectStepHeading("Check Your Answers");

    // Entered names should appear in the review table
    await expect(page.getByText("Alice", { exact: true })).toBeVisible();
    await expect(page.getByText("Walker", { exact: true })).toBeVisible();

    // Each step section should have a "Change" link
    const changeLinks = page.locator("a", { hasText: "Change" });
    await expect(changeLinks.first()).toBeVisible();
    expect(await changeLinks.count()).toBeGreaterThan(3);
  });

  // ─── Declaration & Submission ───────────────────────────────────────────────

  test("Declaration — submits form and shows confirmation", async ({
    page,
  }) => {
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
    await form.fillStep5Source();
    await form.clickContinue();
    await form.waitForStep("step-5-financial-information~1");
    await form.fillStep5Repeat("step-5-financial-information~1", {
      addAnotherAnswer: "No",
    });
    await form.clickContinue();
    await form.waitForStep("check-your-answers");
    await form.clickContinue();
    await form.waitForStep("declaration");

    // Declaration step — just submit
    await form.clickSubmit();
    await form.waitForStep("submission-confirmation");

    // Confirmation page should contain the reference number from the mock
    await expect(page.getByText("TEST-REF-001")).toBeVisible();
  });

  // ─── Back Navigation ────────────────────────────────────────────────────────

  test("Previous button returns to the preceding step", async ({ page }) => {
    const form = new FormPage(page);
    await form.goto();

    await form.fillStep1();
    await form.clickContinue();
    await form.waitForStep("step-2-contact-information");

    // Previous should go back to step 1
    await form.clickPrevious();
    await form.waitForStep("step-1-personal-details");
    await form.expectStepHeading("Personal Details");
  });

  test("Previous button is hidden on the first step", async ({ page }) => {
    const form = new FormPage(page);
    await form.goto();

    await form.waitForStep("step-1-personal-details");
    await expect(form.previousBtn).not.toBeVisible();
  });

  // ─── Session storage preservation on reload ─────────────────────────────────

  test("Form data persists in sessionStorage across page reload", async ({
    page,
  }) => {
    const form = new FormPage(page);
    await form.goto();

    await form.fillStep1({ firstName: "Persist", lastName: "Test" });
    await form.clickContinue();
    await form.waitForStep("step-2-contact-information");

    // Go back to step 1 and reload
    await form.clickPrevious();
    await form.waitForStep("step-1-personal-details");
    await page.reload();
    await form.waitForStep("step-1-personal-details");

    // The first-name field should still have the saved value
    await expect(
      page.locator("input#step-1-personal-details_first-name"),
    ).toHaveValue("Persist");
  });
});
