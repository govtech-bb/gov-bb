/**
 * @vitest-environment jsdom
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComponentPropsWithoutRef } from 'react'
import type * as ReactRouter from '@tanstack/react-router'
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
 * (`<form_id>-start`), the breadcrumbs (`breadcrumb`) and the feedback link
 * (`helpful-feedback`). No network: api_v2's `GET /pages` answer is a fixture
 * read through `resolveApiV2Page`, and `window.umami` is a stub.
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
  const tracked: UmamiEvent[] = track.mock.calls.map(([name, data]) => ({
    name,
    data,
  }))
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

describe('Umami events on api_v2 pages (#3258)', () => {
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
      // `<form_id>-start` event from either source.
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
      { name: 'apply-for-conductor-licence-start', data: { from: url } },
      { name: 'helpful-feedback', data: { path: url } },
    ]
    // Known difference: a static `/start` page names no category, so it
    // reports 'uncategorised'; api_v2 files it under its parent's category
    // (see KNOWN in api-v2-render-parity.test.tsx). When the two agree, this
    // test fails: assert one category for both.
    expect(staticTwin(START_PAGE)).toEqual(expected('uncategorised'))
    expect(await apiV2(START_PAGE)).toEqual(expected('work-employment'))
  })
})
