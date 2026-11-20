import { beforeAll, describe, expect, it } from 'vitest'
import { PAGES } from '../../../content/registry'
import type { ServiceStatusEntry } from '@/lib/service-status'
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

  it('registers the service, publishes by default and honors runtime withdrawal', () => {
    expect(PAGES.find((p) => p.url === META.url)?.frontmatter.title).toBe(
      META.title,
    )
    const published = call(index.options.beforeLoad, {
      context: { level: 'public', serviceStatuses: [] },
    })
    const head = call(index.options.head, { match: { context: published } })
    expect(head.links).toContainEqual(
      expect.objectContaining({ rel: 'canonical' }),
    )
    expect(head.meta).not.toContainEqual({
      name: 'robots',
      content: 'noindex',
    })
    const withdrawn = [[META.url, 'disabled']]
    expect(() =>
      call(index.options.beforeLoad, {
        context: { level: 'public', serviceStatuses: withdrawn },
      }),
    ).toThrow()
    const preview = call(index.options.beforeLoad, {
      context: { level: 'preview', serviceStatuses: withdrawn },
    })
    expect(
      call(index.options.head, { match: { context: preview } }).meta,
    ).toContainEqual({
      name: 'robots',
      content: 'noindex',
    })
  })

  // #3793: the page's `noindex` comes from the level its 404 check works out.
  describe('index noindex follows the 404 check', () => {
    const NOINDEX = { name: 'robots', content: 'noindex' }

    // A route's `match.context` carries its own `beforeLoad` return value.
    function gate(level: string, serviceStatuses: ServiceStatusEntry[]) {
      const context: Record<string, unknown> = {
        level,
        serviceStatuses,
        ...call(index.options.beforeLoad, {
          context: { level, serviceStatuses },
        }),
      }
      return { context, head: call(index.options.head, { match: { context } }) }
    }

    it('is indexable at the public level', () => {
      const { context, head } = gate('public', [[META.url, 'enabled']])
      expect(context.serviceLevel).toBe('public')
      expect(head.meta).not.toContainEqual(NOINDEX)
      expect(head.links).toEqual([
        {
          rel: 'canonical',
          href: expect.stringMatching(new RegExp(`/${META.url}$`)),
        },
      ])
    })

    it('stays indexable for a preview viewer when the service is public', () => {
      const { head } = gate('preview', [[META.url, 'enabled']])
      expect(head.meta).not.toContainEqual(NOINDEX)
    })

    it('404s for the public and is noindexed when service_status puts it in Preview', () => {
      const serviceStatuses: ServiceStatusEntry[] = [[META.url, 'disabled']]
      expect(() =>
        call(index.options.beforeLoad, {
          context: { level: 'public', serviceStatuses },
        }),
      ).toThrow(expect.objectContaining({ isNotFound: true }))
      const { context, head } = gate('preview', serviceStatuses)
      expect(context.serviceLevel).toBe('preview')
      expect(head.meta).toContainEqual(NOINDEX)
    })
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
