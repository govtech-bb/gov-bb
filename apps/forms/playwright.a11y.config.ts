import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for the live accessibility (axe) scan.
 *
 * Sibling to playwright.smoke.config.ts, but with one crucial difference: the
 * a11y scan only LOADS AND SCANS pages — it never fills or submits a form, so
 * it creates no submission rows and needs no X-Smoke-Submission token. It runs
 * against a deployed environment (the per-PR preview in CI, sandbox by default
 * locally) and is deliberately kept out of the normal `test:e2e` / CI unit run
 * so it never scans a local dev build.
 *
 * Run on demand:
 *   pnpm --filter @govtech-bb/forms test:a11y
 *
 * Override the target environment with A11Y_BASE_URL, e.g.
 *   A11Y_BASE_URL=https://forms.alpha.gov.bb pnpm --filter @govtech-bb/forms test:a11y
 */
export default defineConfig({
  testDir: "./e2e/a11y",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  /* A real deployed environment — no retries so a genuine failure is obvious.
   * CI overrides this (see forms-a11y.yml) to absorb transient network flake. */
  retries: 0,
  workers: 1,
  timeout: 60_000,
  reporter: [["line"]],
  use: {
    baseURL: process.env.A11Y_BASE_URL ?? "https://forms.sandbox.alpha.gov.bb",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  /* No webServer: we scan a deployed environment, not a local dev server. */
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
