import type { Page } from "@playwright/test";

/**
 * Intercepts POST /submissions (the NestJS API endpoint) and returns a
 * successful submission response.  Call this before navigating to the form so
 * the route handler is active when the submit button is clicked.
 *
 * The master contract is loaded directly from the bundled JSON (formId
 * "master" bypasses the API), so only the submission endpoint needs mocking.
 */
export async function mockSuccessfulSubmission(page: Page): Promise<void> {
  await page.route("**/submissions", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "success",
        data: {
          id: "TEST-REF-001",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          idempotencyKey: "test-idempotency-key",
          formId: "master-form-v1",
          formVersion: "1.0.0",
          status: "success",
          values: {},
          meta: null,
          submittedAt: new Date().toISOString(),
        },
      }),
    });
  });
}

/**
 * Intercepts the submission endpoint and returns a server-error response.
 * Useful for testing the error-confirmation screen.
 */
export async function mockFailedSubmission(page: Page): Promise<void> {
  await page.route("**/submissions", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ message: "Internal Server Error" }),
    });
  });
}
