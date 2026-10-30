import { describe, expect, it } from 'vitest'
import {
  PINNED_PAGES,
  contentSourceProblem,
  pagesToCheck,
  readSmokeEnv,
  startChain,
  startChains,
} from './api-v2-smoke'
import type { ApiV2Page } from './api-v2-smoke'
import recorded from './fixtures/api-v2-sandbox.json'

const API = 'https://api-v2.test'
const BIRTH = '/family-birth-relationships/get-birth-certificate'
const SUMMER = '/work-employment/register-summer-camp'

/** A fetch that answers from the recorded sandbox api_v2, overridable per test. */
function fakeApi(
  overrides: {
    catalog?: unknown
    catalogStatus?: number
    pages?: Record<string, ApiV2Page | null>
  } = {},
) {
  const pages: Record<string, ApiV2Page | null> = {
    ...(recorded.pages as Record<string, ApiV2Page>),
    ...overrides.pages,
  }
  return async (input: string): Promise<Response> => {
    const url = new URL(input)
    if (url.pathname === '/catalog')
      return Response.json(overrides.catalog ?? recorded.catalog, {
        status: overrides.catalogStatus ?? 200,
      })
    const page = pages[url.searchParams.get('url') ?? '']
    return page
      ? Response.json(page)
      : Response.json({ error: 'not_found' }, { status: 404 })
  }
}

describe('readSmokeEnv', () => {
  it('requires every origin, with no default', () => {
    expect(() => readSmokeEnv({})).toThrow('SMOKE_LANDING_URL is required')
    expect(
      readSmokeEnv({
        SMOKE_LANDING_URL: 'https://landing.test/',
        SMOKE_API_V2_URL: 'https://api.test/x',
        SMOKE_FORMS_URL: 'https://forms.test',
      }),
    ).toEqual({
      landing: 'https://landing.test',
      apiV2: 'https://api.test',
      forms: 'https://forms.test',
    })
  })
})

// #3140: the x-content-source values landing sends (src/lib/api-v2-page.ts).
describe('contentSourceProblem', () => {
  it('passes only a fresh page from api_v2', () => {
    expect(contentSourceProblem(200, 'api_v2')).toBeNull()
  })

  it.each([
    // api_v2 failed and landing served a kept copy.
    [200, 'api_v2-stale', 'x-content-source: api_v2-stale'],
    // api_v2 failed or sent bad content: static markdown instead.
    [200, 'static-fallback', 'x-content-source: static-fallback'],
    // api_v2 unset or emptied: it answered "no page", so static served it.
    [200, 'static', 'x-content-source: static'],
    // A page rendered without the header (a landing built before #3134).
    [200, undefined, 'no x-content-source header'],
    // Neither api_v2 nor static has the page.
    [404, undefined, 'HTTP 404'],
    [301, undefined, 'HTTP 301'],
    [500, undefined, 'HTTP 500'],
  ])('fails HTTP %i with %s', (status, source, problem) => {
    expect(contentSourceProblem(status, source)).toBe(problem)
  })
})

describe('pagesToCheck', () => {
  it('is the pinned pages plus the catalog, once each', async () => {
    const urls = await pagesToCheck(API, fakeApi())
    expect(urls.slice(0, PINNED_PAGES.length)).toEqual(PINNED_PAGES)
    expect(new Set(urls).size).toBe(urls.length)
    expect(urls).toContain(SUMMER)
  })

  it('fails on an empty api_v2', async () => {
    await expect(
      pagesToCheck(API, fakeApi({ catalog: { pages: [] } })),
    ).rejects.toThrow('GET /catalog listed no pages')
  })

  it('fails on a broken api_v2', async () => {
    await expect(
      pagesToCheck(API, fakeApi({ catalogStatus: 500 })),
    ).rejects.toThrow('GET /catalog returned 500')
    await expect(
      pagesToCheck(API, fakeApi({ catalog: { error: 'x' } })),
    ).rejects.toThrow('no pages array')
  })
})

// #3144: which pages must open which form.
describe('startChains', () => {
  it('follows recorded start links to the form each page is bound to', async () => {
    expect(await startChains(API, fakeApi())).toEqual([
      { path: [BIRTH, `${BIRTH}/start`], formId: 'get-birth-certificate' },
      { path: [SUMMER], formId: 'national-summer-camp-2025-registration' },
    ])
    // Severance pay links a calculator, not a form; register-a-birth has no
    // start link. Neither is checked.
  })

  it('fails a start step whose form_id is missing', async () => {
    const start = recorded.pages[`${BIRTH}/start`] as ApiV2Page
    const chains = await startChains(
      API,
      fakeApi({ pages: { [`${BIRTH}/start`]: { ...start, form_id: null } } }),
    )
    expect(chains[0]).toEqual({
      path: [BIRTH, `${BIRTH}/start`],
      problem: `${BIRTH}/start has a start link but no form_id`,
    })
  })

  it('fails a form page whose start step api_v2 does not serve', async () => {
    const chains = await startChains(
      API,
      fakeApi({ pages: { [`${BIRTH}/start`]: null } }),
    )
    expect(chains[0]).toEqual({
      path: [BIRTH],
      problem: `${BIRTH} links ${BIRTH}/start, which api_v2 does not serve`,
    })
  })

  it('carries a mistyped form_id through, for the walk to fail', async () => {
    const page = recorded.pages[SUMMER] as ApiV2Page
    const chains = await startChains(
      API,
      fakeApi({ pages: { [SUMMER]: { ...page, form_id: 'no-such-form' } } }),
    )
    expect(chains[1]).toEqual({ path: [SUMMER], formId: 'no-such-form' })
  })
})

describe('startChain', () => {
  const page = (over: Partial<ApiV2Page>): ApiV2Page => ({
    url: '/a',
    form_id: 'form-a',
    hide_start_links: false,
    body_markdown: '<a data-start-link>Start now</a>',
    ...over,
  })

  it('skips a page that hides its start links', () => {
    const pages = new Map([['/a', page({ hide_start_links: true })]])
    expect(startChain('/a', pages)).toBeNull()
  })

  it('prefers an authored data-form-id over the page form_id', () => {
    const pages = new Map([
      [
        '/a',
        page({ body_markdown: "<a data-start-link data-form-id='b'>Go</a>" }),
      ],
    ])
    expect(startChain('/a', pages)).toEqual({ path: ['/a'], formId: 'b' })
  })

  it('ignores an authored off-site link', () => {
    const pages = new Map([
      [
        '/a',
        page({
          body_markdown: '<a data-start-link href="https://x.test">Go</a>',
        }),
      ],
    ])
    expect(startChain('/a', pages)).toBeNull()
  })

  it('fails a loop of start links', () => {
    const pages = new Map([
      ['/a', page({ body_markdown: '<a data-start-link href="/b">Go</a>' })],
      [
        '/b',
        page({
          url: '/b',
          body_markdown: '<a data-start-link href="/a">Go</a>',
        }),
      ],
    ])
    expect(startChain('/a', pages)).toEqual({
      path: ['/a', '/b'],
      problem: 'start links from /a loop or run too deep',
    })
  })
})
