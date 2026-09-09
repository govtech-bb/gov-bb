import { beforeAll, describe, expect, it } from 'vitest'
import { PAGES } from '../../../content/registry'
import type { Route as IndexRoute } from './index'
import type { Route as LayoutRoute } from './route'
import type { Route as ConfirmRoute } from './confirm'
import type { Route as UnsubscribeRoute } from './unsubscribe'
import { META } from './-meta'

let index: typeof IndexRoute
let layout: typeof LayoutRoute
let confirm: typeof ConfirmRoute
let unsubscribe: typeof UnsubscribeRoute
beforeAll(async () => {
  ;[
    { Route: index },
    { Route: layout },
    { Route: confirm },
    { Route: unsubscribe },
  ] = await Promise.all([
    import('./index'),
    import('./route'),
    import('./confirm'),
    import('./unsubscribe'),
  ])
}, 60_000)

function call(hook: unknown, args: unknown) {
  return (hook as (args: unknown) => Record<string, unknown>)(args)
}

describe('water service publication', () => {
  it('accepts a known parish in shared URLs and ignores invalid selections', () => {
    expect(
      call(index.options.validateSearch, { parish: 'saint-john' }),
    ).toEqual({ parish: 'saint-john' })
    for (const parish of [undefined, '', 'not-a-parish', ['saint-john'], 42]) {
      expect(call(index.options.validateSearch, { parish })).toEqual({
        parish: undefined,
      })
    }
  })

  it('registers the service and honors preview and runtime publication', () => {
    expect(PAGES.find((p) => p.url === META.url)?.frontmatter.title).toBe(
      META.title,
    )
    expect(() =>
      call(index.options.beforeLoad, {
        context: { level: 'public', serviceStatuses: [] },
      }),
    ).toThrow()
    const preview = call(index.options.beforeLoad, {
      context: { level: 'preview', serviceStatuses: [] },
    })
    expect(
      call(index.options.head, { match: { context: preview } }).meta,
    ).toContainEqual({
      name: 'robots',
      content: 'noindex',
    })
    const published = call(index.options.beforeLoad, {
      context: {
        level: 'public',
        serviceStatuses: [[META.url, 'enabled']],
      },
    })
    expect(
      call(index.options.head, { match: { context: published } }).links,
    ).toContainEqual(expect.objectContaining({ rel: 'canonical' }))
  })

  it('keeps emailed confirmation and opt-out links reachable and out of search engines', () => {
    expect(layout.options.beforeLoad).toBeUndefined()
    for (const route of [confirm, unsubscribe]) {
      expect(route.options.beforeLoad).toBeUndefined()
      expect(call(route.options.head, {}).meta).toContainEqual({
        name: 'robots',
        content: 'noindex',
      })
    }
  })
})
