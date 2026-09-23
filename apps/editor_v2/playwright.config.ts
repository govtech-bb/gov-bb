import { defineConfig, devices } from "@playwright/test";

/**
 * Behavioural E2E for the block editor spike.
 *
 * Everything here is real: real Vite dev server, real browser, real PGlite
 * compiled to WASM, real IndexedDB. Nothing is mocked. That matters more
 * than usual for this spike — the storage layer, the multi-tab worker and
 * the live queries have essentially no honest unit-test surface, so the
 * acceptance criteria in the build brief can only be verified by driving
 * the editor the way a content designer would.
 *
 * Each test gets a fresh browser context, so IndexedDB starts empty and the
 * migration + seed runs from scratch. That is deliberate: "migration and
 * seed run on first load" is then exercised by every single test.
 *
 * A dedicated port (3092) avoids colliding with a hand-run `pnpm dev`.
 */
const PORT = 3092;
const BASE_URL = `http://localhost:${PORT}`;
const SITE_PORT = 3093;
const SITE_URL = `http://localhost:${SITE_PORT}`;

// `support.ts` reads this to reach the site.
process.env.SITE_URL ??= SITE_URL;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  /*
   * PGlite costs about 21 seconds to come up, measured, and it does not warm
   * up between navigations — every page load starts the worker, opens
   * IndexedDB and replays the schema check again. A test that opens the
   * editor and then a document pays it twice, which is why the default
   * 30-second budget failed most of this suite while the behaviour under
   * test was fine. The budget has to match what the storage layer actually
   * costs; see the boot-cost finding in the spike notes.
   */
  timeout: 150_000,
  // Above the measured boot, not below it. A 20s expect could never wait out
  // a 21s boot no matter how long the test itself was allowed to run, which
  // is why raising only the test timeout changed nothing.
  expect: { timeout: 45_000 },
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  /*
   * Two servers now: the editor, and the server-rendered site it links to.
   * They were one while the database was PGlite in the browser, because
   * IndexedDB is scoped per origin. The site runs against whatever `api_v2`
   * `VITE_API_URL` names, so a run needs that up too.
   */
  webServer: [
    {
      command: `pnpm exec vite dev --port ${PORT}`,
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      command: `pnpm --filter @govtech-bb/landing-v2 exec vite dev --port ${SITE_PORT}`,
      url: SITE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: "ignore",
      stderr: "pipe",
    },
  ],
});
