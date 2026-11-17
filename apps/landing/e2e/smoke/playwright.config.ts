import { defineConfig, devices } from '@playwright/test'

/**
 * Post-deploy smoke of landing served from api_v2 (#3140, #3143, #3144). Run by
 * .github/workflows/landing-v2-smoke.yml after each Amplify build of
 * `v2-rewrite`. Two projects:
 *
 * - `selftest`: the Start-link walk and the visibility-gating checks against
 *   pages served by a local server, proving a broken page fails them. Needs
 *   no network.
 * - `live`: the deployed landing. Needs SMOKE_LANDING_URL, SMOKE_API_V2_URL,
 *   SMOKE_FORMS_URL and SMOKE_FORMS_API_URL (no defaults), e.g.
 *
 *   SMOKE_LANDING_URL=https://v2-rewrite.d3kbl8o0ovutw4.amplifyapp.com \
 *   SMOKE_API_V2_URL=https://api-v2.sandbox.alpha.gov.bb \
 *   SMOKE_FORMS_URL=https://forms.sandbox.alpha.gov.bb \
 *   SMOKE_FORMS_API_URL=https://forms.api.sandbox.alpha.gov.bb \
 *   pnpm --filter @govtech-bb/landing test:smoke
 *
 *   Optional SMOKE_API_V2_PREVIEW_TOKEN (api_v2's PREVIEW_SECRET) lets the
 *   visibility check find preview pages; unset, that test skips.
 *
 * Files end `.pw.ts` so landing's vitest run never collects them.
 */
export default defineConfig({
  testDir: '.',
  outputDir: '../../test-results',
  forbidOnly: !!process.env.CI,
  // One retry absorbs a post-deploy edge blip without hiding a real failure.
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  // Each live test sweeps every page, one after another.
  timeout: 600_000,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    trace: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    { name: 'selftest', testMatch: /\.selftest\.pw\.ts$/ },
    { name: 'live', testMatch: /\.live\.pw\.ts$/ },
  ],
})
