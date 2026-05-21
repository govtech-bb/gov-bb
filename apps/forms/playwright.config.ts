import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for the modular-forms web app E2E suite.
 *
 * Tests run against the Vite dev server (port 3000).  The server is started
 * automatically in CI; locally an already-running server is reused if one
 * exists so you don't have to restart it between test runs.
 *
 * Design system URL: http://localhost:3000/forms/master
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  /* Fail-fast in CI so the whole suite doesn't run on a broken build */
  forbidOnly: !!process.env.CI,
  /* Retry once in CI to reduce flakiness from animation / timing edges */
  retries: process.env.CI ? 2 : 0,
  /* Single worker in CI to avoid port conflicts; parallel locally */
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["line"],
  ],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    /* Give React time to hydrate before Playwright starts asserting */
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    /* Uncomment for multi-browser coverage in full regression runs:
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
    */
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stderr: "pipe",
    stdout: "ignore",
  },
});
