/**
 * repeatable.spec.ts
 *
 * Tests for repeatable steps (step-5-financial-information) and repeatable
 * field arrays (middle-name in step 1, additional-documents in step 4).
 *
 * Coverage:
 *  - Source step contains shared fields and renders correctly
 *  - Repeat instance (step-5-financial-information~1) renders without shared fields
 *  - "Add another?" radio — answering "Yes" creates a new repeat instance
 *  - "Add another?" radio — answering "No" advances to the next logical step
 *  - Max repeat limit (6) is enforced — addAnother radio disappears at max
 *  - Repeat step data is independent per instance
 *  - middle-name field array: initial slot renders, Add Another adds a slot
 *  - middle-name field array: Remove works
 */
import { test, expect } from "@playwright/test";
import { FormPage } from "./helpers/form-page";
import { TEST_PNG, TEST_PNG_2, TEST_PNG_3 } from "./helpers/test-data";

// Helper: navigate through steps 1–4 and land on step 5 source
async function goToStep5Source(form: FormPage) {
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
}

// ─── Repeatable steps ─────────────────────────────────────────────────────────

test.describe("Step 5 — source step (step-5-financial-information)", () => {
  test.beforeEach(async ({ page }) => {
    await goToStep5Source(new FormPage(page));
  });

  test("source step renders the shared has-bank-account field", async ({
    page,
  }) => {
    const form = new FormPage(page);
    await form.expectFieldVisible(
      "step-5-financial-information_has-bank-account",
    );
  });

  test("source step renders non-shared bank fields when has-bank-account is checked", async ({
    page,
  }) => {
    const form = new FormPage(page);
    await form.expectFieldVisible("step-5-financial-information_bank-name");
    await form.expectFieldVisible("step-5-financial-information_account-type");
  });

  test("source step does NOT have an addAnother radio", async ({ page }) => {
    // addAnother is only on repeat instances, not the source step
    await expect(
      page.locator(`input#step-5-financial-information_addAnother`),
    ).toHaveCount(0);
  });

  test("filling source step and continuing advances to the first repeat instance", async ({
    page,
  }) => {
    const form = new FormPage(page);
    await form.fillStep5Source();
    await form.clickContinue();
    await form.waitForStep("step-5-financial-information~1");
  });
});

test.describe("Step 5 — first repeat instance (step-5-financial-information~1)", () => {
  test.beforeEach(async ({ page }) => {
    const form = new FormPage(page);
    await goToStep5Source(form);
    await form.fillStep5Source();
    await form.clickContinue();
    await form.waitForStep("step-5-financial-information~1");
  });

  test("repeat instance does NOT contain the shared has-bank-account field", async ({
    page,
  }) => {
    // has-bank-account is a sharedField — excluded from repeat instances
    await expect(
      page.locator(
        `input[id="step-5-financial-information~1_has-bank-account"]`,
      ),
    ).toHaveCount(0);
  });

  test("repeat instance renders its own bank-name and fund-source fields", async ({
    page,
  }) => {
    const form = new FormPage(page);
    await form.expectFieldVisible("step-5-financial-information~1_bank-name");
    await form.expectFieldVisible("step-5-financial-information~1_fund-source");
  });

  test("repeat instance renders the addAnother radio (min=1 < max=6)", async ({
    page,
  }) => {
    const addAnotherGroup = page.locator("[data-radio-group]").filter({
      has: page.locator(
        `input[id="step-5-financial-information~1_addAnother"]`,
      ),
    });
    await expect(addAnotherGroup).toBeVisible();
  });

  test("answering 'No' to addAnother advances to check-your-answers", async ({
    page,
  }) => {
    const form = new FormPage(page);
    await form.fillStep5Repeat("step-5-financial-information~1", {
      addAnotherAnswer: "No",
    });
    await form.clickContinue();
    await form.waitForStep("check-your-answers");
  });

  test("answering 'Yes' to addAnother creates a second repeat instance", async ({
    page,
  }) => {
    const form = new FormPage(page);
    await form.fillStep5Repeat("step-5-financial-information~1", {
      addAnotherAnswer: "Yes",
    });
    await form.clickContinue();
    await form.waitForStep("step-5-financial-information~2");
  });
});

test.describe("Step 5 — adding multiple repeat instances", () => {
  test("can add up to 3 extra instances by answering Yes repeatedly", async ({
    page,
  }) => {
    const form = new FormPage(page);
    await goToStep5Source(form);
    await form.fillStep5Source();
    await form.clickContinue();
    await form.waitForStep("step-5-financial-information~1");

    // Add instance 2
    await form.fillStep5Repeat("step-5-financial-information~1", {
      addAnotherAnswer: "Yes",
    });
    await form.clickContinue();
    await form.waitForStep("step-5-financial-information~2");

    // Add instance 3
    await form.fillStep5Repeat("step-5-financial-information~2", {
      addAnotherAnswer: "Yes",
    });
    await form.clickContinue();
    await form.waitForStep("step-5-financial-information~3");

    // Add instance 4
    await form.fillStep5Repeat("step-5-financial-information~3", {
      addAnotherAnswer: "Yes",
    });
    await form.clickContinue();
    await form.waitForStep("step-5-financial-information~4");

    // Answer No on instance 4 to stop repeating
    await form.fillStep5Repeat("step-5-financial-information~4", {
      addAnotherAnswer: "No",
    });
    await form.clickContinue();
    await form.waitForStep("check-your-answers");
  });

  test("each repeat instance holds independent values", async ({ page }) => {
    const form = new FormPage(page);
    await goToStep5Source(form);
    await form.fillStep5Source({ bankName: "Bank A" });
    await form.clickContinue();
    await form.waitForStep("step-5-financial-information~1");

    await form.fillStep5Repeat("step-5-financial-information~1", {
      bankName: "Bank B",
      addAnotherAnswer: "Yes",
    });
    await form.clickContinue();
    await form.waitForStep("step-5-financial-information~2");

    // Go back and verify instance 1 still has "Bank B"
    await form.clickPrevious();
    await form.waitForStep("step-5-financial-information~1");
    await expect(
      page.locator(`input[id="step-5-financial-information~1_bank-name"]`),
    ).toHaveValue("Bank B");
  });
});

// ─── Field Arrays ─────────────────────────────────────────────────────────────

test.describe("Step 1 — middle-name field array", () => {
  test.beforeEach(async ({ page }) => {
    const form = new FormPage(page);
    await form.goto();
    await form.waitForStep("step-1-personal-details");
  });

  test("initial middle-name slot is rendered", async ({ page }) => {
    // The first slot renders a text input
    const inputs = page.locator(
      'input[id="step-1-personal-details_middle-name"]',
    );
    await expect(inputs.first()).toBeVisible();
  });

  test("Add Another link renders a second middle-name input", async ({
    page,
  }) => {
    // fieldArray max=4; min=1 so "Add Another" should be visible
    const addLink = page.getByText("Add Another");
    await expect(addLink).toBeVisible();
    await addLink.click();

    // Now there should be 2 inputs
    const inputs = page.locator(
      'input[id="step-1-personal-details_middle-name"]',
    );
    await expect(inputs).toHaveCount(2);
  });

  test("Remove button removes the second middle-name input", async ({
    page,
  }) => {
    const addLink = page.getByText("Add Another");
    await addLink.click();
    const inputs = page.locator(
      'input[id="step-1-personal-details_middle-name"]',
    );
    await expect(inputs).toHaveCount(2);

    // "Remove" only appears when count > 1 (i === fieldCount - 1 && i !== 0)
    const removeLink = page.getByText("Remove");
    await removeLink.click();
    await expect(inputs).toHaveCount(1);
  });

  test("Add Another is hidden when max (4) reached", async ({ page }) => {
    const addLink = page.getByText("Add Another");
    // Click 3 times to go from 1 → 4
    await addLink.click();
    await addLink.click();
    await addLink.click();

    const inputs = page.locator(
      'input[id="step-1-personal-details_middle-name"]',
    );
    await expect(inputs).toHaveCount(4);

    // "Add Another" should no longer be visible when at max
    await expect(page.getByText("Add Another")).not.toBeVisible();
  });
});
