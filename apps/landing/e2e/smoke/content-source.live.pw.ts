import { expect, test } from '@playwright/test'
import {
  contentSourceProblem,
  pagesToCheck,
  readSmokeEnv,
} from './api-v2-smoke'

// #3140: every known api_v2 page must reach the citizen from api_v2, not a
// static fallback. Landing hides a failing api_v2 behind static markdown, so a
// 200 alone proves nothing; the `x-content-source` header does.
test('landing serves api_v2 pages from api_v2', async ({ request }) => {
  const env = readSmokeEnv(process.env)
  const urls = await pagesToCheck(env.apiV2)
  const problems: string[] = []
  for (const url of urls) {
    const response = await request.get(`${env.landing}${url}`, {
      maxRedirects: 0,
    })
    const problem = contentSourceProblem(
      response.status(),
      response.headers()['x-content-source'],
    )
    if (problem) problems.push(`${url}: ${problem}`)
  }
  console.log(`checked ${urls.length} pages, ${problems.length} failed`)
  expect(problems).toEqual([])
})
