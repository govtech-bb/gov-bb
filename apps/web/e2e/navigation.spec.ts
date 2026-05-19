/**
 * navigation.spec.ts
 *
 * Tests for the step-guard hook (use-step-guard.tsx) and form navigation.
 *
 * Coverage:
 *  - Direct URL access to a locked step redirects to the first incomplete step
 *  - Completing a step marks it done and allows access to the next
 *  - Previous button navigates backwards correctly
 *  - Previous button hidden on step 1
 *  - Entering an unknown step ID redirects gracefully
 *  - Check-Your-Answers Change link returns to the correct step
 */
import { test, expect } from "@playwright/test";
import { FormPage } from "./helpers/form-page";
import { mockSuccessfulSubmission } from "./helpers/submission-mock";
import { TEST_PNG, TEST_PNG_2, TEST_PNG_3 } from "./helpers/test-data";

test.describe("Step Guard — direct URL access", () => {
  test("navigating to step 2 without completing step 1 redirects to step 1", async ({
    page,
  }) => {
    // Navigate directly to step 2 with a fresh session (no completed steps)
    await page.goto("/forms/master?step=step-2-contact-information");
    // The step guard should kick in and redirect to step 1
    await page.waitForURL(/step=step-1-personal-details/, { timeout: 10_000 });
    await expect(page.locator("h1")).toContainText("Personal Details");
  });

  test("navigating to step 3 directly redirects to step 1", async ({
    page,
  }) => {
    await page.goto("/forms/master?step=step-3-address-employment");
    await page.waitForURL(/step=step-1-personal-details/, { timeout: 10_000 });
  });

  test("navigating to check-your-answers without any completed steps redirects to step 1", async ({
    page,
  }) => {
    await page.goto("/forms/master?step=check-your-answers");
    await page.waitForURL(/step=step-1-personal-details/, { timeout: 10_000 });
  });

  test("navigating without a step param redirects to the first incomplete step", async ({
    page,
  }) => {
    await page.goto("/forms/master");
    await page.waitForURL(/step=/, { timeout: 10_000 });
    expect(page.url()).toMatch(/step=step-1-personal-details/);
  });
});

test.describe("Forward & Back navigation", () => {
  test("Previous button is not rendered on step 1", async ({ page }) => {
    const form = new FormPage(page);
    await form.goto();
    await form.waitForStep("step-1-personal-details");
    await expect(form.previousBtn).not.toBeVisible();
  });

  test("Previous button appears from step 2 onwards", async ({ page }) => {
    const form = new FormPage(page);
    await form.goto();
    await form.fillStep1();
    await form.clickContinue();
    await form.waitForStep("step-2-contact-information");
    await expect(form.previousBtn).toBeVisible();
  });

  test("Previous navigates back to the preceding step", async ({ page }) => {
    const form = new FormPage(page);
    await form.goto();
    await form.fillStep1();
    await form.clickContinue();
    await form.waitForStep("step-2-contact-information");
    await form.clickPrevious();
    await form.waitForStep("step-1-personal-details");
    await form.expectStepHeading("Personal Details");
  });

  test("Completing step and going back preserves form values", async ({
    page,
  }) => {
    const form = new FormPage(page);
    await form.goto();
    await form.fillStep1({ firstName: "Memory", lastName: "Test" });
    await form.clickContinue();
    await form.waitForStep("step-2-contact-information");
    await form.clickPrevious();
    await form.waitForStep("step-1-personal-details");

    // Values entered before advancing should still be there
    await expect(
      page.locator("input#step-1-personal-details_first-name"),
    ).toHaveValue("Memory");
    await expect(
      page.locator("input#step-1-personal-details_last-name"),
    ).toHaveValue("Test");
  });

  test("Continue is blocked when required fields are empty", async ({
    page,
  }) => {
    const form = new FormPage(page);
    await form.goto();
    // Clear defaults before clicking Continue
    await page.locator("input#step-1-personal-details_first-name").fill("");
    await page.locator("input#step-1-personal-details_last-name").fill("");
    await form.clickContinue();

    // Should stay on step 1 with errors
    expect(form.currentStepId()).toBe("step-1-personal-details");
    await expect(form.errorSummary).toBeVisible();
  });

  test("multi-step back/forward sequence preserves state throughout", async ({
    page,
  }) => {
    const form = new FormPage(page);
    await form.goto();

    await form.fillStep1({ firstName: "BackForth" });
    await form.clickContinue();
    await form.waitForStep("step-2-contact-information");

    await form.fillStep2();
    await form.clickContinue();
    await form.waitForStep("random-step");

    // Go back two steps
    await form.clickPrevious();
    await form.waitForStep("step-2-contact-information");
    await form.clickPrevious();
    await form.waitForStep("step-1-personal-details");

    // Step 1 first name should still have the value we set
    await expect(
      page.locator("input#step-1-personal-details_first-name"),
    ).toHaveValue("BackForth");

    // Go forward again — step 2 is already complete so we can go forward
    await form.clickContinue();
    await form.waitForStep("step-2-contact-information");
    await form.clickContinue();
    await form.waitForStep("random-step");
  });
});

test.describe("Check-Your-Answers Change links", () => {
  test.beforeEach(async ({ page }) => {
    await mockSuccessfulSubmission(page);
  });

  test("Change link on Personal Details navigates back to step 1", async ({
    page,
  }) => {
    const form = new FormPage(page);
    await form.goto();

    // Navigate all the way to CYA
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

    // Click the "Change" link that navigates back to Personal Details (step 1)
    const changeLinks = page.locator('a[href*="step-1-personal-details"]', {
      hasText: "Change",
    });
    await changeLinks.first().click();

    // Should land on step 1
    await form.waitForStep("step-1-personal-details");
    await form.expectStepHeading("Personal Details");
  });
});

test.describe("Step title rendering", () => {
  const steps = [
    ["step-1-personal-details", "Personal Details"],
    ["step-2-contact-information", "Contact Information"],
    ["step-3-address-employment", "Address & Employment"],
    ["step-4-documents-uploads", "Documents & Uploads"],
    ["step-5-financial-information", "Financial Information"],
  ] as const;

  test("each step renders the correct <h1> heading", async ({ page }) => {
    const form = new FormPage(page);
    await form.goto();

    await form.expectStepHeading(steps[0][1]);

    await form.fillStep1();
    await form.clickContinue();
    await form.waitForStep("step-2-contact-information");
    await form.expectStepHeading(steps[1][1]);

    await form.fillStep2();
    await form.clickContinue();
    await form.waitForStep("random-step");
    await form.clickContinue();
    await form.waitForStep("step-3-address-employment");
    await form.expectStepHeading(steps[2][1]);

    await form.fillStep3();
    await form.clickContinue();
    await form.waitForStep("step-4-documents-uploads");
    await form.expectStepHeading(steps[3][1]);

    await form.fillStep4(TEST_PNG, [TEST_PNG_2, TEST_PNG_3]);
    await form.clickContinue();
    await form.waitForStep("step-5-financial-information");
    await form.expectStepHeading(steps[4][1]);
  });
});
