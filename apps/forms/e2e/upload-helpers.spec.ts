/**
 * upload-helpers.spec.ts
 *
 * Tests the smoke suite's upload helpers (`uploadOne` / `uploadMany` in
 * helpers/smoke.ts) against the mocked API (#2423). The smoke specs themselves
 * run only against deployed environments, so a broken upload there can't be
 * reproduced on demand; here the mock's upload endpoints are made to fail and
 * the helpers must name the failing request and its status, not just time out
 * waiting for a "Remove {name}" button that never appears.
 *
 * Routes registered in a test take precedence over the api-mock fixture's.
 */
import { test, expect } from "./helpers/api-mock";
import { FormPage } from "./helpers/form-page";
import { uploadMany, uploadOne } from "./helpers/smoke";
import { TEST_PNG, TEST_PNG_2, TEST_PNG_3 } from "./helpers/test-data";

const STEP = "step-4-documents-uploads";
// Well under the helpers' 30s upload wait: a failed request must surface at
// once, not after the confirmed-file affordance times out.
const FAIL_FAST_MS = 10_000;

async function openUploadStep(form: FormPage): Promise<void> {
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
  await form.waitForStep(STEP);
}

test.describe("smoke upload helpers name a failed upload's cause (#2423)", () => {
  test("uploadOne still resolves once a healthy upload is confirmed", async ({
    page,
  }) => {
    await openUploadStep(new FormPage(page));
    await uploadOne(page, STEP, "upload-document", TEST_PNG);
    await expect(
      page.getByRole("button", { name: `Remove ${TEST_PNG.name}` }),
    ).toBeVisible();
  });

  test("uploadOne fails fast with the confirm-upload status and body", async ({
    page,
  }) => {
    await openUploadStep(new FormPage(page));
    await page.route("**/files/confirm-upload", (route) =>
      route.fulfill({
        status: 429,
        json: {
          statusCode: 429,
          message: "ThrottlerException: Too Many Requests",
        },
      }),
    );

    const started = Date.now();
    await expect(
      uploadOne(page, STEP, "upload-document", TEST_PNG),
    ).rejects.toThrow(/confirm-upload failed with 429.*Too Many Requests/s);
    expect(Date.now() - started).toBeLessThan(FAIL_FAST_MS);
  });

  test("uploadOne fails fast with the presign-upload status", async ({
    page,
  }) => {
    await openUploadStep(new FormPage(page));
    await page.route("**/files/presign-upload", (route) =>
      route.fulfill({
        status: 500,
        json: { message: "Internal server error" },
      }),
    );

    const started = Date.now();
    await expect(
      uploadOne(page, STEP, "upload-document", TEST_PNG),
    ).rejects.toThrow(/presign-upload failed with 500/);
    expect(Date.now() - started).toBeLessThan(FAIL_FAST_MS);
  });

  test("uploadMany names the failing request for the file it stopped on", async ({
    page,
  }) => {
    await openUploadStep(new FormPage(page));
    let confirms = 0;
    // Let the first file through; throttle the second, as a real burst would.
    await page.route("**/files/confirm-upload", (route) =>
      ++confirms === 1
        ? route.fallback()
        : route.fulfill({
            status: 429,
            json: { message: "Too Many Requests" },
          }),
    );

    await expect(
      uploadMany(page, STEP, "proof-of-address", [TEST_PNG_2, TEST_PNG_3]),
    ).rejects.toThrow(
      new RegExp(`confirm-upload failed with 429.*${TEST_PNG_3.name}`, "s"),
    );
  });
});
