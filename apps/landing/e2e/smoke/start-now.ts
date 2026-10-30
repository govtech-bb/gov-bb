import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { UNAVAILABLE_NOTICES, contentSourceProblem } from './api-v2-smoke'
import type { SmokeEnv } from './api-v2-smoke'

/**
 * Walks one start chain (api-v2-smoke.ts `startChain`) on the deployed landing
 * the way a citizen does: open the catalog page, click its Start link through
 * each landing step, and land on the form's first step. Throws on the first
 * thing that breaks.
 *
 * Returns `'unavailable'` when landing shows its maintenance or closed notice:
 * then the missing Start link is landing working as designed, and the form is
 * not this check's concern. A `form_id` that names no form gets no notice and
 * no Start link, so it fails here.
 */
export async function walkStartChain(
  page: Page,
  env: SmokeEnv,
  chain: { path: string[]; formId: string },
): Promise<'opened' | 'unavailable'> {
  const main = page.locator('main')
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

    for (const notice of UNAVAILABLE_NOTICES) {
      if (await main.getByText(notice).count()) return 'unavailable'
    }
    const next = chain.path[i + 1]
    const href = next ?? `${env.forms}/forms/${chain.formId}`
    const link = main.locator(`a[href="${href}"]`).first()
    await expect(link, `${path} has no Start link to ${href}`).toBeVisible()
    await link.click()
    const target = new URL(href, env.landing).href
    await page.waitForURL((url) => url.href.startsWith(target))
  }

  // The forms app adds `?step=` once it has loaded the recipe and shown the
  // first step; an unknown form shows "Form not found" with no step.
  await page.waitForURL(
    (url) =>
      url.pathname.replace(/\/$/, '') === `/forms/${chain.formId}` &&
      url.searchParams.has('step'),
  )
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible()
  return 'opened'
}
