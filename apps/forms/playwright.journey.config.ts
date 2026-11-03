import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the post-deploy journeys (#3010, J3+).
 *
 * Deliberately SEPARATE from playwright.smoke.config.ts and playwright.config.ts
 * so a journey — which flips real `service_status` as a side effect — is never
 * swept into `test:smoke` or `test:e2e`. It runs only via `test:journey` (or the
 * deploy-sandbox workflow), against a deployed environment named by the per-spec
 * env vars (E2E_API_BASE_URL / E2E_LANDING_URL / SMOKE_BASE_URL). Those are
 * validated inside each spec, so there is no required base URL here.
 */
export default defineConfig({
  testDir: "./e2e/journeys",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // A deployed target — no retries: a retry re-flips the service (audit churn,
  // extra throttled PUTs) and would mask an intermittent propagation failure.
  retries: 0,
  workers: 1,
  // The journey polls past landing's 60s status cache across two flips; the
  // spec sets its own ~4m per-test budget, this is the backstop above it.
  timeout: 300_000,
  reporter: [["line"]],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
