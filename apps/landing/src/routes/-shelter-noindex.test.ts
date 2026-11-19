import { beforeAll, describe, expect, it } from 'vitest'
import type { ServiceStatusEntry } from '@/lib/service-status'

// #3788: each Find an emergency shelter page must take its robots `noindex`
// from the level its layout route's 404 check works out — the service_status
// overlay included.
const KEY = 'health-and-emergency-services/find-an-emergency-shelter'
const DIR = `./${KEY}`
const PAGES = [
  ['index', `${DIR}/index`],
  ['find', `${DIR}/find`],
  ['guidance', `${DIR}/guidance`],
] as const

type Hook = (args: unknown) => Record<string, unknown>
let layoutBeforeLoad: Hook
const heads = new Map<string, Hook>()

beforeAll(async () => {
  const layout = (await import(`${DIR}/route`)) as {
    Route: { options: { beforeLoad: unknown } }
  }
  layoutBeforeLoad = layout.Route.options.beforeLoad as Hook
  for (const [name, path] of PAGES) {
    const { Route } = (await import(path)) as {
      Route: { options: { head: unknown } }
    }
    heads.set(name, Route.options.head as Hook)
  }
}, 60_000)

const NOINDEX = { name: 'robots', content: 'noindex' }

// A child's `match.context` carries its parent's `beforeLoad` return value.
function headFor(page: string, level: string, statuses: ServiceStatusEntry[]) {
  const context = {
    level,
    serviceStatuses: statuses,
    ...layoutBeforeLoad({ context: { level, serviceStatuses: statuses } }),
  }
  return heads.get(page)!({ match: { context } })
}

describe.each(PAGES.map(([name]) => name))('shelter %s page', (page) => {
  it('is indexable at the public level', () => {
    const head = headFor(page, 'public', [[KEY, 'enabled']])
    expect(head.meta).not.toContainEqual(NOINDEX)
  })

  it('stays indexable for a preview viewer when the tool is public', () => {
    const head = headFor(page, 'preview', [[KEY, 'enabled']])
    expect(head.meta).not.toContainEqual(NOINDEX)
  })

  it('404s for the public and is noindexed when service_status puts it in Preview', () => {
    const serviceStatuses: ServiceStatusEntry[] = [[KEY, 'disabled']]
    expect(() =>
      layoutBeforeLoad({ context: { level: 'public', serviceStatuses } }),
    ).toThrow(expect.objectContaining({ isNotFound: true }))
    expect(headFor(page, 'preview', serviceStatuses).meta).toContainEqual(
      NOINDEX,
    )
  })
})
