import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for the on-demand live smoke test.
 *
 * Unlike playwright.config.ts (which boots a local Vite dev server and runs the
 * synthetic `master` form against mocked submissions), this config targets a
 * deployed environment and submits for real.  It is intentionally separate so
 * the live smoke spec is NEVER swept into the normal `test:e2e` / CI run.
 *
 * SMOKE_BASE_URL names the target environment and is REQUIRED — there is no
 * default. A smoke run submits for real, so the environment it lands in has to
 * be a deliberate choice: an implicit fallback meant a mistyped or unset
 * variable silently posted a live application to whichever environment the
 * default happened to name.
 *
 * Run on demand:
 *   SMOKE_BASE_URL=https://forms.sandbox.alpha.gov.bb pnpm --filter @govtech-bb/forms test:smoke
 *
 * Point it at a local stack (Vite is started for you if it isn't already up;
 * the API still has to be running separately):
 *   SMOKE_BASE_URL=http://localhost:3000 pnpm --filter @govtech-bb/forms test:smoke
 */

const rawBaseURL = process.env.SMOKE_BASE_URL?.trim();
if (!rawBaseURL) {
  throw new Error(
    "SMOKE_BASE_URL is required: the live smoke submits for real, so the target " +
      "environment must be named explicitly (there is no default).\n" +
      "  e.g. SMOKE_BASE_URL=https://forms.sandbox.alpha.gov.bb pnpm --filter @govtech-bb/forms test:smoke",
  );
}

let baseURL: URL;
try {
  baseURL = new URL(rawBaseURL);
} catch {
  throw new Error(
    `SMOKE_BASE_URL is not a valid URL: ${JSON.stringify(rawBaseURL)} — ` +
      "expected an absolute origin such as https://forms.sandbox.alpha.gov.bb",
  );
}

/* Only a local target gets a dev server. Booting Vite while pointed at a
 * deployed environment would be pointless at best, and actively misleading at
 * worst: if that environment were down, `reuseExistingServer` would fall
 * through to a local server and the run would report on localhost while
 * claiming to test sandbox. */
const isLocalTarget = ["localhost", "127.0.0.1", "[::1]"].includes(
  baseURL.hostname,
);

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
    baseURL: baseURL.href,
    /* When SMOKE_SUBMISSION_TOKEN is set, tell the API every request from this
     * run is a smoke submission so it drops all processors (no real emails /
     * webhooks / payment gating) while still exercising the real persist/
     * validate path. Set globally — it rides along to S3 presign / CDN requests
     * too, which ignore unknown headers (#1252).
     *
     * Attach the header ONLY when the token is present. An empty token is
     * fail-closed (the API ignores it), so sending an empty header buys nothing
     * — and a custom request header makes the submission a CORS-preflighted
     * request. The per-PR preview smoke runs against the *deployed* sandbox API,
     * which only allows `X-Smoke-Submission` once this change ships (ADR 0029);
     * sending it before then fails the preflight and blocks the submit. Omitting
     * it when unset keeps the smoke behaving exactly as before. */
    ...(process.env.SMOKE_SUBMISSION_TOKEN
      ? {
          extraHTTPHeaders: {
            "X-Smoke-Submission": process.env.SMOKE_SUBMISSION_TOKEN,
          },
        }
      : {}),
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    /* Optional slow-motion for watching a headed run, e.g. SMOKE_SLOWMO=500. */
    launchOptions: { slowMo: Number(process.env.SMOKE_SLOWMO) || 0 },
  },
  /* A local target boots Vite if nothing is already serving that URL;
   * `reuseExistingServer` makes an already-running `pnpm dev` the fast path.
   * The port comes from SMOKE_BASE_URL rather than `npm run dev` (whose script
   * hard-codes one), so the server always lands on the URL being tested. A
   * deployed target gets no webServer at all — see isLocalTarget above. */
  ...(isLocalTarget
    ? {
        webServer: {
          command: `pnpm exec vite dev --port ${baseURL.port || "80"}`,
          url: baseURL.href,
          reuseExistingServer: true,
          timeout: 120_000,
          stderr: "pipe" as const,
        },
      }
    : {}),
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
