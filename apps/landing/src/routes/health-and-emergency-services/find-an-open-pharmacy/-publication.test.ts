import { beforeAll, describe, expect, it } from 'vitest'
import { findPage, isVisible } from '@/content/registry'
import { collectSitemapEntries } from '@/lib/sitemap'
import { deriveVisibilityOverlay } from '@/lib/service-status'
import type { ServiceStatusEntry } from '@/lib/service-status'
import type { Route as FinderRoute } from './find'
import type { Route as DetailRoute } from './$slug'
import { PHARMACIES } from './-data/pharmacies'

const service = 'health-and-emergency-services/find-an-open-pharmacy'
const enabled: ServiceStatusEntry[] = [[service, 'enabled']]

let finder: typeof FinderRoute
let detail: typeof DetailRoute
beforeAll(async () => {
  ;({ Route: finder } = await import('./find'))
  ;({ Route: detail } = await import('./$slug'))
}, 60_000)

function call(hook: unknown, args: unknown) {
  return (hook as (args: unknown) => Record<string, unknown>)(args)
}

describe('pharmacy publication', () => {
  it.each([
    'health-and-emergency-services/free-or-subsidised-medication',
    'health-and-emergency-services/prescription-colours',
  ])('publishes supporting page %s without status overrides', (url) => {
    const page = findPage(url)!
    expect(page).toBeDefined()
    expect(isVisible(page, 'public')).toBe(true)
    expect(collectSitemapEntries().map((entry) => entry.path)).toContain(
      `/${url}`,
    )
  })

  it('uses effective public visibility for gates, canonical tags and structured data', () => {
    for (const route of [finder, detail]) {
      const context = call(route.options.beforeLoad, {
        context: { level: 'public', serviceStatuses: enabled },
      })
      const params = { slug: 'winston-scott-polyclinic' }
      const loaderData =
        route === detail ? call(detail.options.loader, { params }) : undefined
      const head = call(route.options.head, {
        loaderData,
        params,
        match: { context },
      })
      expect(context.serviceLevel).toBe('public')
      expect(head.meta).not.toContainEqual({
        name: 'robots',
        content: 'noindex',
      })
      expect(head.links).toEqual([
        expect.objectContaining({ rel: 'canonical' }),
      ])
      if (route === detail)
        expect(head.scripts).toEqual([
          expect.objectContaining({ type: 'application/ld+json' }),
        ])
    }
    const paths = collectSitemapEntries(deriveVisibilityOverlay(enabled)).map(
      (e) => e.path,
    )
    for (const [key] of enabled) expect(paths).toContain(`/${key}`)
    expect(paths).toContain(`/${service}/find`)
    for (const pharmacy of PHARMACIES)
      expect(paths).toContain(`/${service}/${pharmacy.slug}`)
    expect(paths).toContain(`/${service}/market-hill-dispensary`)
  })

  it('keeps withdrawn services private throughout the route family', () => {
    for (const serviceStatuses of [[[service, 'disabled']]]) {
      for (const route of [finder, detail]) {
        expect(() =>
          call(route.options.beforeLoad, {
            context: { level: 'public', serviceStatuses },
          }),
        ).toThrow()
        const context = call(route.options.beforeLoad, {
          context: { level: 'preview', serviceStatuses },
        })
        const params = { slug: 'winston-scott-polyclinic' }
        const loaderData =
          route === detail ? call(detail.options.loader, { params }) : undefined
        const head = call(route.options.head, {
          loaderData,
          params,
          match: { context },
        })
        expect(head.meta).toContainEqual({ name: 'robots', content: 'noindex' })
        expect(head).not.toHaveProperty('links')
        expect(head).not.toHaveProperty('scripts')
      }
    }
    const paths = collectSitemapEntries(
      deriveVisibilityOverlay([[service, 'disabled']]),
    ).map((e) => e.path)
    expect(paths.some((path) => path.startsWith(`/${service}`))).toBe(false)
  })

  // #3793: each page's `noindex` (and the detail page's JSON-LD) comes from
  // the level its 404 check works out.
  describe.each(['find', '$slug'])(
    '%s noindex follows the 404 check',
    (name) => {
      const NOINDEX = { name: 'robots', content: 'noindex' }
      const params = { slug: 'winston-scott-polyclinic' }
      const route = () => (name === 'find' ? finder : detail)

      // A route's `match.context` carries its own `beforeLoad` return value.
      function gate(level: string, serviceStatuses: ServiceStatusEntry[]) {
        const context = {
          level,
          serviceStatuses,
          ...call(route().options.beforeLoad, {
            context: { level, serviceStatuses },
          }),
        }
        const loaderData =
          name === '$slug' ? call(detail.options.loader, { params }) : undefined
        const head = call(route().options.head, {
          loaderData,
          params,
          match: { context },
        })
        return { context, head }
      }

      it('is indexable at the public level', () => {
        const { context, head } = gate('public', enabled)
        expect(context.serviceLevel).toBe('public')
        expect(head.meta).not.toContainEqual(NOINDEX)
        if (name === '$slug')
          expect(head.scripts).toEqual([
            expect.objectContaining({ type: 'application/ld+json' }),
          ])
      })

      it('stays indexable for a preview viewer when the service is public', () => {
        const { head } = gate('preview', enabled)
        expect(head.meta).not.toContainEqual(NOINDEX)
      })

      it('404s for the public and is noindexed when service_status puts it in Preview', () => {
        const serviceStatuses: ServiceStatusEntry[] = [[service, 'disabled']]
        expect(() =>
          call(route().options.beforeLoad, {
            context: { level: 'public', serviceStatuses },
          }),
        ).toThrow(expect.objectContaining({ isNotFound: true }))
        const { context, head } = gate('preview', serviceStatuses)
        expect(context.serviceLevel).toBe('preview')
        expect(head.meta).toContainEqual(NOINDEX)
        expect(head).not.toHaveProperty('scripts')
      })
    },
  )

  it('resolves pharmacies without hours and returns not found for unknown slugs', () => {
    for (const slug of [
      'market-hill-dispensary',
      'holborn-pharmacy',
      'dasae-pharmacy-sparman-clinic',
    ]) {
      expect(
        call(detail.options.loader, {
          params: { slug },
        }),
      ).toMatchObject({ slug })
    }
    expect(() =>
      call(detail.options.loader, {
        params: { slug: 'unknown-pharmacy' },
      }),
    ).toThrow()
  })
})
