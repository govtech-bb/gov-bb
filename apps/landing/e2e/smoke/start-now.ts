import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { UNAVAILABLE_NOTICES, contentSourceProblem } from './api-v2-smoke'
import type { SmokeEnv } from './api-v2-smoke'

/** Per navigation, so a few broken chains can't eat the test's budget. */
const STEP = { timeout: 15_000 }

/**
 * Walks one start chain (api-v2-smoke.ts `startChain`) on the deployed landing
 * the way a citizen does: open the catalog page, click its Start link through
 * each landing step, and land on the form's first step. Throws on the first
 * thing that breaks.
 *
 * Returns `'unavailable'` when landing shows its maintenance or closed banner
 * for the chain's own form: then the missing Start link is landing working as
 * designed. A `form_id` that names no public form gets no banner and no Start
 * link, so it fails here.
 */
export async function walkStartChain(
  page: Page,
  env: SmokeEnv,
  chain: { path: string[]; pageFormIds: (string | null)[]; formId: string },
): Promise<'opened' | 'unavailable'> {
  const main = page.locator('main')
  // The banner landing renders above a page ($.tsx), not body copy that
  // happens to share its words.
  const banner = main
    .locator('.govbb-status-banner')
    .filter({ hasText: new RegExp(UNAVAILABLE_NOTICES.join('|')) })
  await page.goto(`${env.landing}${chain.path[0]}`)
  for (const [i, path] of chain.path.entries()) {
    // Clicks after the first page are client-side navigations, which carry
    // no response headers, so each page's source is checked by a request.
    const response = await page.request.get(`${env.landing}${path}`, {
      maxRedirects: 0,
    })
    const problem = contentSourceProblem(
      response.status(),
      response.headers()['x-content-source'],
    )
    if (problem) throw new Error(`${path}: ${problem}`)

    const next = chain.path[i + 1]
    const href = next ?? `${env.forms}/forms/${chain.formId}`
    const link = main.locator(`a[href="${href}"]`).first()
    // Waits for the page to render either, so a client-side navigation
    // still showing the previous page can't be read too early.
    await expect(
      link.or(banner).first(),
      `${path} has no Start link to ${href}`,
    ).toBeVisible()
    if (await banner.count()) {
      // The banner is for the page's own form_id.
      if (chain.pageFormIds[i] === chain.formId) return 'unavailable'
      throw new Error(
        `${path}: unavailable banner for ${chain.pageFormIds[i]}, not ${chain.formId}`,
      )
    }
    await link.click()
    const target = new URL(href, env.landing).href
    await page.waitForURL((url) => url.href.startsWith(target), STEP)
  }

  // The forms app adds `?step=` once it has loaded the recipe and shown the
  // first step; an unknown form shows "Form not found" with no step.
  await page.waitForURL(
    (url) =>
      url.pathname.replace(/\/$/, '') === `/forms/${chain.formId}` &&
      url.searchParams.has('step'),
    STEP,
  )
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  // "Submit" when the first step is also the last (form-renderer.tsx).
  await expect(
    page.getByRole('button', { name: /^(Continue|Submit)/ }),
  ).toBeVisible()
  return 'opened'
}
