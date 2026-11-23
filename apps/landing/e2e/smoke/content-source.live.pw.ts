import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import {
  contentSourceProblem,
  featureRouteUrls,
  pagesToCheck,
  readSmokeEnv,
} from './api-v2-smoke'

const routesDir = fileURLToPath(new URL('../../src/routes', import.meta.url))

// #3140: every known api_v2 page must reach the citizen from api_v2, not a
// static fallback. Landing hides a failing api_v2 behind static markdown, so a
// 200 alone proves nothing; the `x-content-source` header does. Feature routes
// are rendered by landing itself, so they are skipped (#3759).
test('landing serves api_v2 pages from api_v2', async ({ request }) => {
  const env = readSmokeEnv(process.env)
  const featureRoutes = featureRouteUrls(
    readdirSync(routesDir, { recursive: true, encoding: 'utf8' }),
  )
  const urls = await pagesToCheck(env.apiV2, fetch, featureRoutes)
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
