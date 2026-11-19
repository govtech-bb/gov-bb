/**
 * @vitest-environment jsdom
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComponentPropsWithoutRef } from 'react'
import type * as ReactRouter from '@tanstack/react-router'
import estate from '@api-v2-seed/estate.json'
import { Breadcrumbs } from '../components/Breadcrumbs'
import { HelpfulBox } from '../components/HelpfulBox'
import { MarkdownContent } from '../components/markdown'
import { findPage } from '../content/registry'
import type { ContentPage } from '../content/registry'
import { pageViewEvent } from '../routes/-page-view-event'
import { trackEvent } from './analytics'
import { resolveApiV2Page } from './api-v2-page'
import type { PageResponse } from './api-v2-page'
import { SERVICE_PAGE, START_PAGE } from './api-v2-umami-events.fixture'
import { sitePath } from './breadcrumb-trail'

/**
 * The Umami events an api_v2 page sends match its static twin's (#3258): the
 * page view (`page-service-view` / `page-start-view`), the Start button
 * (`start-click`), the breadcrumbs (`breadcrumb`) and the feedback link
 * (`helpful-feedback`). No network: api_v2's `GET /pages` answer is a fixture
 * read through `resolveApiV2Page`, and `window.umami` is a stub.
 *
 * Scope: `events` calls `pageViewEvent` and `trackEvent` as `$.tsx`'s
 * PageView effect does, without rendering the route. Both sides get the
 * page's form as available and its Start links shown; whether the route
 * hides them (`hide_start_links` vs `shouldHideStartLink`) is not compared.
 * The static twin renders as landing does with api_v2 unset, so its
 * breadcrumbs come from the static taxonomy.
 */

const location = vi.hoisted(() => ({ pathname: '/' }))

type MockLinkProps = ComponentPropsWithoutRef<'a'> & { to: string }

vi.mock('@tanstack/react-router', async (orig) => ({
  ...(await orig<typeof ReactRouter>()),
  Link: ({ to, ...props }: MockLinkProps) => <a href={to} {...props} />,
  useLocation: () => location,
  useRouterState: ({
    select,
  }: {
    select: (state: { location: typeof location }) => unknown
  }) => select({ location }),
}))

const track = vi.fn()

beforeEach(() => {
  window.umami = { track }
})

afterEach(() => {
  cleanup()
  track.mockReset()
  delete window.umami
})

interface UmamiEvent {
  name: string
  data?: Record<string, unknown>
}

/**
 * Every event the page sends: the page view `$.tsx`'s PageView tracks on
 * mount, then each `data-umami-event` element Umami tracks on click, in page
 * order, with its `data-umami-event-*` properties.
 */
function events(page: ContentPage, trail?: PageResponse['breadcrumbs']) {
  const pathname = `/${page.url}`
  location.pathname = pathname
  const view = pageViewEvent(page)
  if (view) trackEvent(view.name, view.data)
  const formId = page.frontmatter.form_id
  const { container } = render(
    <>
      <Breadcrumbs
        pathname={pathname}
        trail={trail?.map((crumb) => ({
          name: crumb.name,
          url: sitePath(crumb.url),
        }))}
      />
      <MarkdownContent
        hast={page.hast}
        frontmatter={page.frontmatter}
        availableForms={new Set(formId ? [formId] : [])}
      />
      <HelpfulBox />
    </>,
  )
  // trackEvent hands Umami a payload builder (#3503), as Umami's tracker does.
  const tracked: UmamiEvent[] = track.mock.calls.map(([build]) => {
    const { name, data } = (build as (p: object) => UmamiEvent)({})
    return { name, data }
  })
  const clicks: UmamiEvent[] = [
    ...container.querySelectorAll<HTMLElement>('[data-umami-event]'),
  ].map((element) => {
    const data: Record<string, unknown> = {}
    for (const { name, value } of element.attributes) {
      const key = name.match(/^data-umami-event-(.+)$/)?.[1]
      if (key) data[key] = value
    }
    return { name: element.dataset.umamiEvent ?? '', data }
  })
  cleanup()
  track.mockReset()
  return [...tracked, ...clicks]
}

async function apiV2(response: PageResponse) {
  const result = await resolveApiV2Page(
    'http://api.example',
    response.url,
    async () => Response.json(response),
  )
  if (result.kind !== 'page') throw new Error(JSON.stringify(result))
  return events(result.page, response.breadcrumbs)
}

function staticTwin(response: PageResponse) {
  const page = findPage(response.url.replace(/^\//, ''))
  if (!page) throw new Error(`no static page for ${response.url}`)
  return events(page)
}

const crumb = (to: string) => ({
  name: 'breadcrumb',
  data: { to, depth: String(to.split('/').filter(Boolean).length) },
})

const startLinks = (markdown: string) =>
  markdown.match(/<a data-start-link[^>]*>[^<]*<\/a>/g)

describe('Umami events on api_v2 pages (#3258)', () => {
  // The fixture is hand-written; tie the fields that drive events to api_v2's
  // seed snapshot, so the fixture can't claim what api_v2 doesn't send.
  it.each([SERVICE_PAGE, START_PAGE])(
    "the fixture for $url agrees with api_v2's seed",
    (response) => {
      const seed = estate.pages.find((page) => page.url === response.url)
      if (!seed) throw new Error(`${response.url} is not seeded`)
      expect(response.category).toBe(seed.category)
      expect(response.form_id).toBe(seed.form_id)
      expect(startLinks(response.body_markdown)).toEqual(
        startLinks(seed.body_markdown),
      )
    },
  )

  it('a service page sends the same events as its static twin', async () => {
    const url = SERVICE_PAGE.url
    const expected = [
      {
        name: 'apply-for-conductor-licence:page-service-view',
        data: {
          form: 'apply-for-conductor-licence',
          category: 'work-employment',
        },
      },
      crumb('/'),
      crumb('/work-employment'),
      // "Apply online" links to the /start page by href, so it sends no
      // `start-click` event from either source.
      { name: 'helpful-feedback', data: { path: url } },
    ]
    expect(staticTwin(SERVICE_PAGE)).toEqual(expected)
    expect(await apiV2(SERVICE_PAGE)).toEqual(expected)
  })

  it('a start page sends the same events as its static twin, apart from the page-view category', async () => {
    const url = START_PAGE.url
    const expected = (category: string) => [
      {
        name: 'apply-for-conductor-licence:page-start-view',
        data: { form: 'apply-for-conductor-licence', category },
      },
      crumb('/'),
      crumb('/work-employment'),
      crumb('/work-employment/apply-for-conductor-licence'),
      {
        name: 'start-click',
        data: { 'form-id': 'apply-for-conductor-licence', from: url },
      },
      { name: 'helpful-feedback', data: { path: url } },
    ]
    // Known difference: a static `/start` page names no category, so it
    // reports 'uncategorised'; api_v2 files it under its parent's category
    // (see KNOWN in api-v2-render-parity.test.tsx). #3258's "Done when"
    // accepts api_v2's value as correct, so start-page analytics move from
    // 'uncategorised' to the real category at cutover. When the two agree,
    // this test fails: assert one category for both.
    expect(staticTwin(START_PAGE)).toEqual(expected('uncategorised'))
    expect(await apiV2(START_PAGE)).toEqual(expected('work-employment'))
  })
})
