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
  /* A real deployed environment — no retries so a genuine failure is obvious. */
  retries: 0,
  workers: 1,
  /* Per-test budget. The default 30s is too tight for a long, many-step form
   * walked under SMOKE_SLOWMO (each action is delayed, so a full run can take
   * ~40-50s at slowMo=500). A genuine hang still fails fast via the per-action
   * `actionTimeout` (15s) / `navigationTimeout` (30s) below — this only widens
   * the cumulative budget so a slow-motion observation run isn't killed
   * mid-walk. */
  timeout: 120_000,
  reporter: [["line"]],
  use: {
    baseURL: process.env.SMOKE_BASE_URL ?? "https://forms.sandbox.alpha.gov.bb",
    /* Tell the API every request from this run is a smoke submission so it
     * drops all processors (no real emails / webhooks / payment gating) while
     * still exercising the real persist/validate path. The header is honoured
     * only when its value matches the API's SMOKE_SUBMISSION_TOKEN secret; an
     * empty/absent token is ignored (fail-closed), so a local `test:smoke` run
     * without the env var behaves exactly as before. Set globally — it rides
     * along to S3 presign / CDN requests too, which ignore unknown headers
     * (#1252). */
    extraHTTPHeaders: {
      "X-Smoke-Submission": process.env.SMOKE_SUBMISSION_TOKEN ?? "",
    },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    /* Optional slow-motion for watching a headed run, e.g. SMOKE_SLOWMO=500. */
    launchOptions: { slowMo: Number(process.env.SMOKE_SLOWMO) || 0 },
  },
  /* No webServer: we test a deployed environment, not a local dev server. */
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
