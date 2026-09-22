import { defineConfig, devices } from '@playwright/test'

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
const PORT = 3092
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  // Booting PGlite and seeding 163 pharmacy records takes a moment on the
  // first paint of every test; give assertions room.
  expect: { timeout: 20_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm exec vite dev --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
