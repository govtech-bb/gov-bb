import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type * as PublicHolidaysModule from '../../lib/public-holidays'
import type * as CalendarRouteModule from './index'

const publicHolidays = vi.hoisted(() => vi.fn())

vi.mock('../../lib/public-holidays', async (importOriginal) => ({
  ...(await importOriginal<typeof PublicHolidaysModule>()),
  getPublicHolidays: publicHolidays,
}))

let Route: typeof CalendarRouteModule.Route
let routeTree: AnyRoute
beforeAll(async () => {
  ;({ Route } = await import('./index'))
  const root = createRootRoute()
  // As routeTree.gen.ts wires it, under a bare root.
  routeTree = root.addChildren([
    Route.update({
      id: '/bank-holiday-calendar/',
      path: '/bank-holiday-calendar/',
      getParentRoute: () => root,
    } as never),
  ])
  // 2027 is then a future year, whatever the real date.
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-06-01') })
}, 60_000)
afterAll(() => vi.useRealTimers())

/** The calendar for 2027, as the server renders it. */
async function render2027() {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: ['/bank-holiday-calendar?year=2027'],
    }),
  })
  await router.load()
  return renderToStaticMarkup(<RouterProvider router={router} />)
}

describe('bank holiday calendar', () => {
  it('shows a one-off holiday from the collection', async () => {
    publicHolidays.mockResolvedValue([
      {
        date: '2027-03-15',
        name: 'Cricket World Cup Final',
        note: 'Declared by the Government',
      },
    ])
    const html = await render2027()
    expect(html).toContain('Cricket World Cup Final')
    expect(html).toContain('Declared by the Government')
    expect(html).toContain('15 bank holidays will be observed in 2027')
  })

  it.each([
    ['no one-off holidays', () => publicHolidays.mockResolvedValue([])],
    [
      'a failed read',
      () => publicHolidays.mockRejectedValue(new Error('fetch failed')),
    ],
  ])('shows the calculated holidays on %s', async (_, arrange) => {
    arrange()
    const html = await render2027()
    expect(html).toContain('14 bank holidays will be observed in 2027')
    expect(html).toContain('Errol Barrow Day')
    expect(html).not.toContain('Cricket World Cup Final')
    expect(html).toContain('Last updated on 5 May 2026')
  })

  it.each([
    [
      'a newer record moves it on',
      '2026-10-02T15:00:00.000Z',
      '2 October 2026',
    ],
    ['an older record leaves it', '2026-01-10T15:00:00.000Z', '5 May 2026'],
  ])('shows when the page last changed: %s', async (_, updatedAt, shown) => {
    publicHolidays.mockResolvedValue([
      {
        date: '2027-03-15',
        name: 'Cricket World Cup Final',
        updated_at: updatedAt,
      },
    ])
    expect(await render2027()).toContain(`Last updated on ${shown}`)
  })
})
