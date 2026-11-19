import { beforeAll, describe, expect, it } from 'vitest'
import type { ServiceStatusEntry } from '@/lib/service-status'

// #3255: each calculator `/form` route must take its robots `noindex` from the
// same level as its 404 check — the service_status overlay included.
const ROUTES = [
  [
    'calculate-severance-pay',
    './money-financial-support/calculate-severance-pay/form',
  ],
  [
    'calculate-your-pension',
    './pensions-and-gratuities/calculate-your-pension/form',
  ],
  [
    'national-insurance-for-self-employed-workers',
    './money-financial-support/national-insurance-for-self-employed-workers/form',
  ],
  ['crop-over-permits', './business-trade/crop-over-permits/form'],
] as const

type Hook = (args: unknown) => Record<string, unknown>
const routes = new Map<string, { beforeLoad: Hook; head: Hook }>()

beforeAll(async () => {
  for (const [key, path] of ROUTES) {
    const { Route } = (await import(path)) as {
      Route: { options: { beforeLoad: unknown; head: unknown } }
    }
    routes.set(key, {
      beforeLoad: Route.options.beforeLoad as Hook,
      head: Route.options.head as Hook,
    })
  }
}, 60_000)

const NOINDEX = { name: 'robots', content: 'noindex' }

function headFor(key: string, level: string, statuses: ServiceStatusEntry[]) {
  const route = routes.get(key)!
  const context = {
    level,
    serviceStatuses: statuses,
    ...route.beforeLoad({ context: { level, serviceStatuses: statuses } }),
  }
  return route.head({ match: { context } })
}

describe.each(ROUTES.map(([key]) => key))('%s/form', (key) => {
  it('is indexable when service_status enables it', () => {
    const head = headFor(key, 'public', [[key, 'enabled']])
    expect(head.meta).not.toContainEqual(NOINDEX)
  })

  it('404s for the public and is noindexed when service_status disables it', () => {
    const route = routes.get(key)!
    const serviceStatuses: ServiceStatusEntry[] = [[key, 'disabled']]
    expect(() =>
      route.beforeLoad({ context: { level: 'public', serviceStatuses } }),
    ).toThrow()
    expect(headFor(key, 'preview', serviceStatuses).meta).toContainEqual(
      NOINDEX,
    )
  })
})
