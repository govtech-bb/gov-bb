import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for the on-demand live smoke test.
 *
 * Unlike playwright.config.ts (which boots a local Vite dev server and runs the
 * synthetic `master` form against mocked submissions), this config targets a
 * deployed environment and submits for real.  It is intentionally separate so
 * the live smoke spec is NEVER swept into the normal `test:e2e` / CI run.
 *
 * Run on demand:
 *   pnpm --filter @govtech-bb/forms test:smoke
 *
 * Override the target environment with SMOKE_BASE_URL, e.g.
 *   SMOKE_BASE_URL=https://forms.alpha.gov.bb pnpm --filter @govtech-bb/forms test:smoke
 */
export default defineConfig({
  testDir: "./e2e/smoke",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  /* Locally: no retries so a genuine failure is obvious. In CI we run against a
   * freshly-built ephemeral preview, so allow one retry to absorb cold-start /
   * CDN-propagation flakiness (a retry re-runs the whole flow → one extra real
   * submission only on a first-attempt failure). */
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["line"]],
  use: {
    baseURL: process.env.SMOKE_BASE_URL ?? "https://forms.sandbox.alpha.gov.bb",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  /* No webServer: we test a deployed environment, not a local dev server. */
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
