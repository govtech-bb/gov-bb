import { defineConfig, devices } from '@playwright/test'

/**
 * Visual parity of landing page templates (#3142): each template is
 * screenshotted on landing served from api_v2 and on the static baseline,
 * and the two are compared with Playwright's image comparator. Both are
 * deployed sites, so there is no webServer.
 *
 *   pnpm --filter @govtech-bb/landing parity:visual
 *
 * V2_BASE_URL and STATIC_BASE_URL override the two hosts. Diffs (expected =
 * static, actual = api_v2) land in test-results/parity/.
 */
export default defineConfig({
  testDir: './e2e/parity',
  testMatch: '*.visual.ts',
  outputDir: './test-results/parity',
  // The static screenshot is written here as the "expected" image just
  // before each comparison (see templates.visual.ts); never committed.
  snapshotPathTemplate:
    './test-results/parity-baseline/{projectName}/{arg}{ext}',
  updateSnapshots: 'none',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  timeout: 90_000,
  reporter: [['list']],
  expect: {
    toMatchSnapshot: { threshold: 0.3, maxDiffPixelRatio: 0.02 },
  },
  use: {
    trace: 'retain-on-failure',
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'mobile-390',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: 'desktop-1280',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
})
