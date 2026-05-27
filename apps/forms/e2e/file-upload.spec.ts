/**
 * file-upload.spec.ts
 *
 * Tests for file upload fields in Step 4 (Documents & Uploads).
 *
 * Coverage:
 *  - Uploading a valid file adds it to the list
 *  - Removing an uploaded file removes it from the list
 *  - Invalid MIME type triggers error
 *  - File exceeding per-item size limit triggers error
 *  - Multiple uploads accumulate
 *  - proof-of-address: minItems validation (< 2 files)
 *  - proof-of-address: maxItems validation (> 3 files)
 *  - proof-of-address: total maxSize validation
 *  - additional-documents field-array: add / remove via upload
 */
import { test, expect } from "@playwright/test";
import { FormPage } from "./helpers/form-page";
import {
  TEST_PNG,
  TEST_PNG_2,
  TEST_PNG_3,
  OVERSIZED_PNG,
  INVALID_TYPE_FILE,
  MINIMAL_PNG_BUFFER,
} from "./helpers/test-data";

// Helper: navigate to step 4 so every test can start there
async function goToStep4(form: FormPage) {
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

test.describe("upload-document (single file, required)", () => {
  test.beforeEach(async ({ page }) => {
    await goToStep4(new FormPage(page));
  });

  test("uploading a valid PNG adds it to the file list", async ({ page }) => {
    const form = new FormPage(page);
    await form.uploadFiles(
      "step-4-documents-uploads_upload-document",
      TEST_PNG,
    );

    const listItem = page
      .locator(".govbb-file-upload")
      .filter({
        has: page.locator(
          "input[type=file]#step-4-documents-uploads_upload-document",
        ),
      })
      .locator(".govbb-file-upload__name");

    await expect(listItem).toHaveText("test-document.png");
  });

  test("removing an uploaded file clears the list", async ({ page }) => {
    const form = new FormPage(page);
    await form.uploadFiles(
      "step-4-documents-uploads_upload-document",
      TEST_PNG,
    );

    const listItem = page
      .locator(".govbb-file-upload")
      .filter({
        has: page.locator(
          "input[type=file]#step-4-documents-uploads_upload-document",
        ),
      })
      .locator(".govbb-file-upload__item");

    await expect(listItem).toHaveCount(1);
    await form.removeUploadedFile(
      "step-4-documents-uploads_upload-document",
      0,
    );
    await expect(listItem).toHaveCount(0);
  });

  test("invalid MIME type triggers fileTypes error", async ({ page }) => {
    const form = new FormPage(page);
    await form.uploadFiles(
      "step-4-documents-uploads_upload-document",
      INVALID_TYPE_FILE,
    );
    await form.clickContinue();
    await form.expectError("Only PDF, JPG and PNG files are accepted");
  });

  test("file exceeding 5 MB per-item limit triggers itemMaxSize error", async ({
    page,
  }) => {
    const form = new FormPage(page);
    await form.uploadFiles(
      "step-4-documents-uploads_upload-document",
      OVERSIZED_PNG,
    );
    await form.clickContinue();
    await form.expectError("File size must not exceed 5MB");
  });

  test("required: no file shows error on continue", async ({ page }) => {
    const form = new FormPage(page);
    await form.clickContinue();
    await form.expectError("Please upload an identity document");
  });
});

test.describe("proof-of-address (multiple files, min 2 / max 3)", () => {
  test.beforeEach(async ({ page }) => {
    await goToStep4(new FormPage(page));
  });

  test("uploading two valid files satisfies minItems=2", async ({ page }) => {
    const form = new FormPage(page);
    await form.uploadFiles(
      "step-4-documents-uploads_proof-of-address",
      TEST_PNG,
    );
    await form.uploadFiles(
      "step-4-documents-uploads_proof-of-address",
      TEST_PNG_2,
    );

    const items = page
      .locator(".govbb-file-upload")
      .filter({
        has: page.locator(
          "input[type=file]#step-4-documents-uploads_proof-of-address",
        ),
      })
      .locator(".govbb-file-upload__item");

    await expect(items).toHaveCount(2);
  });

  test("only one file triggers minItems error", async ({ page }) => {
    const form = new FormPage(page);
    await form.uploadFiles(
      "step-4-documents-uploads_proof-of-address",
      TEST_PNG,
    );
    await form.clickContinue();
    await form.expectError("Please upload at least 2 documents");
  });

  test("four files triggers maxItems error", async ({ page }) => {
    const form = new FormPage(page);
    for (const f of [TEST_PNG, TEST_PNG_2, TEST_PNG_3, TEST_PNG]) {
      await form.uploadFiles("step-4-documents-uploads_proof-of-address", f);
    }
    await form.clickContinue();
    await form.expectError("You can upload a maximum of 3 documents");
  });

  test("total size exceeding 0.5 MB triggers maxSize error", async ({
    page,
  }) => {
    const form = new FormPage(page);
    const bigFile = {
      name: "big.png",
      mimeType: "image/png",
      // Two files at 300 KB each = 600 KB total > 512 KB limit
      buffer: Buffer.alloc(300 * 1024, 0x00),
    };
    await form.uploadFiles(
      "step-4-documents-uploads_proof-of-address",
      bigFile,
    );
    await form.uploadFiles(
      "step-4-documents-uploads_proof-of-address",
      bigFile,
    );
    await form.clickContinue();
    await form.expectError("Total size must not exceed 0.5MB");
  });

  test("removing one of two files then continuing triggers minItems error", async ({
    page,
  }) => {
    const form = new FormPage(page);
    await form.uploadFiles(
      "step-4-documents-uploads_proof-of-address",
      TEST_PNG,
    );
    await form.uploadFiles(
      "step-4-documents-uploads_proof-of-address",
      TEST_PNG_2,
    );
    // Remove first file
    await form.removeUploadedFile(
      "step-4-documents-uploads_proof-of-address",
      0,
    );
    await form.clickContinue();
    await form.expectError("Please upload at least 2 documents");
  });
});

test.describe("additional-documents (field array)", () => {
  test.beforeEach(async ({ page }) => {
    await goToStep4(new FormPage(page));
  });

  test("uploading to the first additional-document slot works", async ({
    page,
  }) => {
    const form = new FormPage(page);
    await form.uploadFiles(
      "step-4-documents-uploads_additional-documents",
      TEST_PNG,
    );

    const fileItems = page
      .locator(".govbb-file-upload")
      .filter({
        has: page.locator(
          "input[type=file]#step-4-documents-uploads_additional-documents",
        ),
      })
      .locator(".govbb-file-upload__name");

    await expect(fileItems.first()).toHaveText("test-document.png");
  });
});

test.describe("Step 4 — full upload happy path", () => {
  test("all upload fields filled correctly advances to step 5", async ({
    page,
  }) => {
    const form = new FormPage(page);
    await goToStep4(form);

    await form.fillStep4(TEST_PNG, [TEST_PNG_2, TEST_PNG_3]);
    await form.clickContinue();
    await form.waitForStep("step-5-financial-information");
  });
});
