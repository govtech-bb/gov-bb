import { expect, test } from '@playwright/test'
import {
  gatedForms,
  gatedPages,
  previewPageUrls,
  readSmokeEnv,
} from './api-v2-smoke'
import type { GatedForms } from './api-v2-smoke'
import {
  checkGatedPage,
  checkGatedStart,
  checkPreviewHidden,
} from './visibility'

// #3143: api_v2 pages landing must keep from the public. Preview pages 404;
// a page whose own form is under maintenance, switched off by its service
// status, or closed shows the notice and no Start link, and its `/start`
// step 404s.

const message = (error: unknown) => (error as Error).message.split('\n')[0]

/** Skips the test and logs why: the list reporter doesn't print the reason. */
function skip(reason: string): void {
  console.log(`skipped: ${reason}`)
  test.skip(true, reason)
}

test('preview pages are hidden from the public', async ({ request }) => {
  const env = readSmokeEnv(process.env)
  const token = process.env.SMOKE_API_V2_PREVIEW_TOKEN
  // In CI a missing secret must fail, or the check would stop running green.
  if (!token && process.env.CI)
    throw new Error('SMOKE_API_V2_PREVIEW_TOKEN is unset in CI')
  if (!token) return skip('preview: SMOKE_API_V2_PREVIEW_TOKEN is unset')
  const urls = await previewPageUrls(env.apiV2, token)
  if (urls.length === 0) return skip('preview: no live example on sandbox')
  const problems: string[] = []
  for (const url of urls) {
    try {
      await checkPreviewHidden(request, env, url)
    } catch (error) {
      problems.push(message(error))
    }
  }
  console.log(`preview: checked ${urls.length} pages`)
  expect(problems).toEqual([])
})

// Read once for the three gated states.
let discovered: ReturnType<typeof gatedPages> | undefined
const discover = () => {
  const env = readSmokeEnv(process.env)
  discovered ??= gatedForms(env.formsApi).then((gated) =>
    gatedPages(env.apiV2, gated),
  )
  return discovered
}

const STATES: [string, keyof GatedForms][] = [
  ['maintenance', 'maintenance'],
  ['status-disabled', 'statusDisabled'],
  ['closed', 'closed'],
]

for (const [name, state] of STATES) {
  test(`${name} pages hide their Start links`, async ({ page }) => {
    const env = readSmokeEnv(process.env)
    const pages = (await discover())[state]
    if (pages.length === 0) return skip(`${name}: no live example on sandbox`)
    const problems: string[] = []
    for (const gated of pages) {
      try {
        if (gated.url.endsWith('/start'))
          await checkGatedStart(page.request, env, gated.url)
        else await checkGatedPage(page, env, state, gated)
      } catch (error) {
        problems.push(message(error))
      }
    }
    if (!pages.some((gated) => gated.url.endsWith('/start')))
      console.log(`${name}: no /start page, so its /start check was skipped`)
    console.log(`${name}: checked ${pages.map((p) => p.url).join(', ')}`)
    expect(problems).toEqual([])
  })
}
