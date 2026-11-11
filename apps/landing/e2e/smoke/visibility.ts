import { expect } from '@playwright/test'
import type { APIRequestContext, Page } from '@playwright/test'
import {
  UNAVAILABLE_NOTICES,
  contentSourceProblem,
  fetchPage,
} from './api-v2-smoke'
import type { Fetch, GatedForms, GatedPage, SmokeEnv } from './api-v2-smoke'

/** The notice landing shows for each gated state ($.tsx). */
const NOTICE: Record<keyof GatedForms, string> = {
  maintenance: UNAVAILABLE_NOTICES[0],
  statusDisabled: UNAVAILABLE_NOTICES[0],
  closed: UNAVAILABLE_NOTICES[1],
}

/**
 * #3143: a gated api_v2 page still comes from api_v2, shows the state's
 * notice in landing's banner, and offers no way into its form.
 */
export async function checkGatedPage(
  page: Page,
  env: SmokeEnv,
  state: keyof GatedForms,
  gated: GatedPage,
): Promise<void> {
  const response = await page.request.get(`${env.landing}${gated.url}`, {
    maxRedirects: 0,
  })
  const problem = contentSourceProblem(
    response.status(),
    response.headers()['x-content-source'],
  )
  if (problem) throw new Error(`${gated.url}: ${problem}`)

  // The DOM, not the HTML: the raw page also carries the markdown, Start
  // links included, escaped for hydration.
  await page.goto(`${env.landing}${gated.url}`)
  const main = page.locator('main')
  const banner = main
    .locator('.govbb-status-banner')
    .filter({ hasText: NOTICE[state] })
  await expect(
    banner,
    `${gated.url} has no "${NOTICE[state]}" banner`,
  ).toBeVisible()
  // Landing renders a Start link as a plain anchor (MarkdownLink.tsx drops
  // `data-start-link`) to exactly the form or the `/start` step.
  const startLinks = main.locator(
    `a[href="${env.forms}/forms/${gated.formId}"], a[href="${gated.url}/start"]`,
  )
  if (await startLinks.count())
    throw new Error(`${gated.url} shows a Start link to ${gated.formId}`)
}

/** A gated `/start` step is not served at all. */
export async function checkGatedStart(
  request: APIRequestContext,
  env: SmokeEnv,
  url: string,
): Promise<void> {
  const response = await request.get(`${env.landing}${url}`, {
    maxRedirects: 0,
  })
  if (response.status() !== 404)
    throw new Error(`${url}: HTTP ${response.status()}, not 404`)
}

/**
 * A preview page reaches no one without the token: api_v2 has no such public
 * page, and landing 404s rather than serving it from static markdown.
 */
export async function checkPreviewHidden(
  request: APIRequestContext,
  env: SmokeEnv,
  url: string,
  fetchImpl: Fetch = fetch,
): Promise<void> {
  if (await fetchPage(env.apiV2, url, fetchImpl))
    throw new Error(`${url}: api_v2 serves it without the preview token`)
  const response = await request.get(`${env.landing}${url}`, {
    maxRedirects: 0,
  })
  if (response.status() !== 404)
    throw new Error(
      `${url}: HTTP ${response.status()} (x-content-source: ${
        response.headers()['x-content-source'] ?? 'none'
      }), not 404`,
    )
}
