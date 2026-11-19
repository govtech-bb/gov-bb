import { expect, test } from '@playwright/test'
import { readSmokeEnv, startChains } from './api-v2-smoke'
import { walkStartChain } from './start-now'

// #3144: every api_v2 page bound to a form opens that form's first step from
// its Start link. Nothing is submitted.
test('Start links on api_v2 pages open their forms', async ({ page }) => {
  const env = readSmokeEnv(process.env)
  const chains = await startChains(env.apiV2)
  expect(chains.length, 'no api_v2 page links a form').toBeGreaterThan(0)
  const problems: string[] = []
  for (const chain of chains) {
    const label = chain.path.join(' -> ')
    if ('problem' in chain) {
      problems.push(chain.problem)
      continue
    }
    await test.step(label, async () => {
      try {
        const result = await walkStartChain(page, env, chain)
        console.log(`${result}: ${label} -> ${chain.formId}`)
      } catch (error) {
        problems.push(`${label}: ${(error as Error).message.split('\n')[0]}`)
      }
    })
  }
  expect(problems).toEqual([])
})
