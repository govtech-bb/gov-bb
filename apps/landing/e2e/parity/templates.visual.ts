/**
 * One page per template, screenshotted on landing served from api_v2 and on
 * the static baseline, then compared (#3142). Thresholds are in
 * playwright.parity.config.ts.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const V2 =
  process.env.V2_BASE_URL ?? 'https://v2-rewrite.d3kbl8o0ovutw4.amplifyapp.com'
const STATIC = process.env.STATIC_BASE_URL ?? 'https://staging.alpha.gov.bb'

const TEMPLATES = [
  { name: 'category-listing', path: '/family-birth-relationships' },
  // No subcategory index or tables-and-details page is public on either
  // host yet; these are skipped while both answer 404 (see below).
  { name: 'subcategory-index', path: '/youth-and-community' },
  {
    name: 'service-page',
    path: '/family-birth-relationships/register-a-birth',
  },
  {
    name: 'start-page',
    path: '/family-birth-relationships/get-birth-certificate/start',
  },
  {
    name: 'tables-and-details',
    path: '/pensions-and-gratuities/calculate-your-pension/about-government-pensions',
  },
  {
    // Self-rendered (.tsx) page: must still render from static.
    name: 'self-rendered',
    path: '/health-and-emergency-services/stormready/checklist',
  },
]

/** Load a page; returns its status and `x-content-source`. */
async function load(page: Page, url: string) {
  const res = await page.goto(url, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  return {
    status: res?.status() ?? 0,
    source: res?.headers()['x-content-source'] ?? null,
  }
}

const pageHeight = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollHeight)

/**
 * Screenshot the page at a given height, with load-to-load noise masked.
 * Both pages are stretched to the taller one's height first: the
 * comparator fails any size mismatch outright, which would bypass the
 * pixel thresholds for a page that's one wrapped line longer.
 */
async function shoot(page: Page, height: number) {
  await page.evaluate((h) => {
    document.documentElement.style.minHeight = `${h}px`
  }, height)
  return page.screenshot({
    fullPage: true,
    animations: 'disabled',
    caret: 'hide',
    mask: [page.locator('time')],
  })
}

for (const { name, path } of TEMPLATES) {
  test(`${name} (${path})`, async ({ page, context }, testInfo) => {
    const v2Page = await context.newPage()
    const base = await load(page, STATIC + path)
    const v2 = await load(v2Page, V2 + path)
    test.skip(
      base.status === 404 && v2.status === 404,
      `${path} is not public on either host`,
    )
    expect(v2.status, 'api_v2 status').toBe(base.status)
    // A fallback is static markdown: it would match without testing api_v2.
    expect(v2.source, 'x-content-source').not.toMatch(
      /^(api_v2-stale|static-fallback)$/,
    )

    const height = Math.max(await pageHeight(page), await pageHeight(v2Page))
    const baseShot = await shoot(page, height)
    const v2Shot = await shoot(v2Page, height)

    // The static screenshot is the expected image for the comparator.
    const file = `${name}.png`
    const baseline = testInfo.snapshotPath(file)
    mkdirSync(dirname(baseline), { recursive: true })
    writeFileSync(baseline, baseShot)
    expect(v2Shot).toMatchSnapshot(file)
  })
}
