import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Element, RootContent } from 'hast'
import {
  API_V2_TIMEOUT_MS,
  contentSource,
  fetchApiV2Page,
  fromApiV2,
  resolveApiV2Base,
  resolveApiV2Page,
} from './api-v2-page'
import type { ApiV2MissReason, PageResponse } from './api-v2-page'

const BASE = 'http://api.example'

function pageBody(overrides: Partial<PageResponse> = {}): PageResponse {
  return {
    url: '/family-birth-relationships/register-a-birth',
    frontmatter: { title: 'Register a birth', description: 'How to' },
    body_markdown: '## Who can register\n\nText.',
    form_id: null,
    hide_start_links: false,
    breadcrumbs: [],
    published_at: null,
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

function stubFetch(response: Response | Error) {
  return vi.fn(async () => {
    if (response instanceof Error) throw response
    return response
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>
}

/** The one `api_v2_fallback` line logged through `spy`, parsed. */
function logged(spy: ReturnType<typeof vi.spyOn>) {
  expect(spy).toHaveBeenCalledTimes(1)
  return JSON.parse(spy.mock.calls[0][0] as string) as Record<string, unknown>
}

function findElement(
  nodes: Array<RootContent>,
  match: (el: Element) => boolean,
): Element | undefined {
  for (const node of nodes) {
    if (node.type !== 'element') continue
    if (match(node)) return node
    const hit = findElement(node.children, match)
    if (hit) return hit
  }
  return undefined
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('resolveApiV2Base', () => {
  it('prefers the runtimeConfig value over the env value', () => {
    expect(resolveApiV2Base('https://config.example', 'https://env')).toBe(
      'https://config.example',
    )
  })

  it('falls back to the env value when runtimeConfig is empty', () => {
    expect(resolveApiV2Base('', 'https://env.example')).toBe(
      'https://env.example',
    )
  })

  it('trims trailing slashes', () => {
    expect(resolveApiV2Base('https://api.example//', undefined)).toBe(
      'https://api.example',
    )
  })

  it('returns null when neither source is set', () => {
    expect(resolveApiV2Base(undefined, undefined)).toBeNull()
    expect(resolveApiV2Base('', '')).toBeNull()
  })
})

describe('fetchApiV2Page', () => {
  it('maps a 200 to a page and asks for the encoded url without following redirects', async () => {
    const body = pageBody()
    const fetchImpl = stubFetch(jsonResponse(200, body))
    const result = await fetchApiV2Page(BASE, '/a b', fetchImpl)
    expect(result).toEqual({ kind: 'page', body, cacheControl: null })
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe(`${BASE}/pages?url=%2Fa%20b`)
    expect(init.redirect).toBe('manual')
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('passes Cache-Control through on a page', async () => {
    const result = await fetchApiV2Page(
      BASE,
      '/x',
      stubFetch(
        jsonResponse(200, pageBody(), { 'Cache-Control': 'max-age=60' }),
      ),
    )
    expect(result).toMatchObject({ kind: 'page', cacheControl: 'max-age=60' })
  })

  it('treats a 404 as a silent not_found miss carrying its Cache-Control', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await fetchApiV2Page(
      BASE,
      '/x',
      stubFetch(
        jsonResponse(
          404,
          { error: 'not found' },
          { 'Cache-Control': 'public, max-age=10' },
        ),
      ),
    )
    expect(result).toEqual({
      kind: 'miss',
      reason: 'not_found',
      cacheControl: 'public, max-age=10',
    })
    expect(warn).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })

  it('cancels the unread body of a miss so the socket is released', async () => {
    const response = jsonResponse(404, { error: 'not found' })
    const cancel = vi.spyOn(response.body!, 'cancel')
    await fetchApiV2Page(BASE, '/x', stubFetch(response))
    expect(cancel).toHaveBeenCalled()
  })

  it.each([500, 408, 429])(
    'treats a %i as a status miss and logs an error',
    async (status) => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      const result = await fetchApiV2Page(
        BASE,
        '/x',
        stubFetch(jsonResponse(status, {})),
      )
      expect(result).toEqual({ kind: 'miss', reason: 'status' })
      expect(logged(error)).toEqual({
        event: 'api_v2_fallback',
        reason: 'status',
        url: '/x',
        status,
      })
    },
  )

  it('treats a network error as a miss and logs an error', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await fetchApiV2Page(
      BASE,
      '/x',
      stubFetch(new TypeError('fetch failed')),
    )
    expect(result).toEqual({ kind: 'miss', reason: 'network' })
    expect(logged(error)).toEqual({
      event: 'api_v2_fallback',
      reason: 'network',
      url: '/x',
      error: 'fetch failed',
    })
  })

  it('treats a 4xx as a silent rejected miss (api_v2 answering, not failing)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await fetchApiV2Page(
      BASE,
      '/x',
      stubFetch(jsonResponse(400, {})),
    )
    expect(result).toEqual({
      kind: 'miss',
      reason: 'rejected',
      cacheControl: null,
    })
    expect(warn).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })

  it('treats a timeout while reading a 301 body as a timeout miss', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const stalledBody = vi.fn(
      async (_url: string, init: RequestInit) =>
        ({
          status: 301,
          headers: new Headers(),
          json: () =>
            new Promise((_, reject) => {
              init.signal!.addEventListener('abort', () =>
                reject(new DOMException('aborted', 'AbortError')),
              )
            }),
        }) as unknown as Response,
    ) as unknown as typeof fetch
    const pending = fetchApiV2Page(BASE, '/x', stalledBody)
    await vi.advanceTimersByTimeAsync(API_V2_TIMEOUT_MS)
    expect(await pending).toEqual({ kind: 'miss', reason: 'timeout' })
  })

  it('times out after 750 ms (#3148 budget)', () => {
    expect(API_V2_TIMEOUT_MS).toBe(750)
  })

  it('treats a timeout as a timeout miss', async () => {
    vi.useFakeTimers()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const neverResolves = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init.signal!.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          )
        }),
    ) as unknown as typeof fetch
    const pending = fetchApiV2Page(BASE, '/x', neverResolves)
    await vi.advanceTimersByTimeAsync(API_V2_TIMEOUT_MS)
    expect(await pending).toEqual({ kind: 'miss', reason: 'timeout' })
    expect(logged(error)).toMatchObject({
      event: 'api_v2_fallback',
      reason: 'timeout',
      url: '/x',
      error: 'aborted',
    })
  })

  it('treats a timeout while reading the body as a timeout miss', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const stalledBody = vi.fn(
      async (_url: string, init: RequestInit) =>
        ({
          status: 200,
          headers: new Headers(),
          json: () =>
            new Promise((_, reject) => {
              init.signal!.addEventListener('abort', () =>
                reject(new DOMException('aborted', 'AbortError')),
              )
            }),
        }) as unknown as Response,
    ) as unknown as typeof fetch
    const pending = fetchApiV2Page(BASE, '/x', stalledBody)
    await vi.advanceTimersByTimeAsync(API_V2_TIMEOUT_MS)
    expect(await pending).toEqual({ kind: 'miss', reason: 'timeout' })
  })

  it('treats an unparseable 200 body as a miss and warns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await fetchApiV2Page(
      BASE,
      '/x',
      stubFetch(new Response('<html>', { status: 200 })),
    )
    expect(result).toEqual({ kind: 'miss', reason: 'malformed' })
    expect(logged(warn)).toEqual({
      event: 'api_v2_fallback',
      reason: 'malformed',
      url: '/x',
    })
  })

  it('treats a malformed 200 body as a miss', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await fetchApiV2Page(
      BASE,
      '/x',
      stubFetch(jsonResponse(200, { url: '/x', frontmatter: {} })),
    )
    expect(result).toEqual({ kind: 'miss', reason: 'malformed' })
  })

  it('treats a 200 without a boolean hide_start_links as a miss', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { hide_start_links: _, ...body } = pageBody()
    const result = await fetchApiV2Page(
      BASE,
      '/x',
      stubFetch(jsonResponse(200, body)),
    )
    expect(result).toEqual({ kind: 'miss', reason: 'malformed' })
  })

  it('maps a 301 to a redirect from the body', async () => {
    const result = await fetchApiV2Page(
      BASE,
      '/old',
      stubFetch(
        jsonResponse(
          301,
          { redirect: '/new' },
          { Location: '/elsewhere', 'Cache-Control': 'max-age=60' },
        ),
      ),
    )
    expect(result).toEqual({
      kind: 'redirect',
      to: '/new',
      cacheControl: 'max-age=60',
    })
  })

  it('falls back to the Location header for a 301 with no body redirect', async () => {
    const result = await fetchApiV2Page(
      BASE,
      '/old',
      stubFetch(
        new Response(null, { status: 301, headers: { Location: '/new' } }),
      ),
    )
    expect(result).toEqual({ kind: 'redirect', to: '/new', cacheControl: null })
  })

  it('treats a 301 with no target as a no_target failure and warns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await fetchApiV2Page(
      BASE,
      '/old',
      stubFetch(jsonResponse(301, {})),
    )
    expect(result).toEqual({ kind: 'miss', reason: 'no_target' })
    expect(logged(warn)).toEqual({
      event: 'api_v2_fallback',
      reason: 'no_target',
      url: '/old',
    })
  })

  it.each([
    '//evil.example',
    '/\\evil.example',
    '\\/evil.example',
    'https://evil.example',
    'http://evil.example/x',
    'javascript:alert(1)',
    '/\t/evil.example',
    '/ evil',
    '%2F%2Fevil.example',
    'https://www.alpha.gov.bb/x',
  ])(
    'refuses a 301 to the off-site target %j as a cacheable bad_redirect and warns',
    async (target) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const result = await fetchApiV2Page(
        BASE,
        '/old',
        stubFetch(
          jsonResponse(
            301,
            { redirect: target },
            { 'Cache-Control': 'max-age=60' },
          ),
        ),
      )
      expect(result).toEqual({
        kind: 'miss',
        reason: 'bad_redirect',
        cacheControl: 'max-age=60',
      })
      expect(logged(warn)).toEqual({
        event: 'api_v2_fallback',
        reason: 'bad_redirect',
        url: '/old',
        to: target,
      })
    },
  )

  it('refuses an off-site Location header on a 301 with no body redirect', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await fetchApiV2Page(
      BASE,
      '/x',
      stubFetch(
        new Response(null, {
          status: 301,
          headers: { Location: 'https://api-v2.example/pages?url=%2Fx' },
        }),
      ),
    )
    expect(result).toEqual({
      kind: 'miss',
      reason: 'bad_redirect',
      cacheControl: null,
    })
    expect(warn).toHaveBeenCalled()
  })

  it.each([
    '/x',
    '/',
    '/a/b?c=1#d',
    '/%2F%2Fevil.example',
    '/work-employment/new-service',
  ])('follows a 301 to the same-site path %j', async (to) => {
    const result = await fetchApiV2Page(
      BASE,
      '/old',
      stubFetch(jsonResponse(301, { redirect: to })),
    )
    expect(result).toEqual({ kind: 'redirect', to, cacheControl: null })
  })
})

describe('fromApiV2', () => {
  it('maps url, slug, categories, visibility and frontmatter', async () => {
    const page = await fromApiV2(
      pageBody({
        frontmatter: {
          title: 'Register a birth',
          description: 'How to',
          lede: 'Lede',
          stage: 'alpha',
          service_type: 'digital',
          keywords: ['baby'],
        },
        form_id: 'register-birth',
        hide_start_links: true,
      }),
    )
    expect(page.url).toBe('family-birth-relationships/register-a-birth')
    expect(page.slug).toBe('register-a-birth')
    expect(page.hideStartLinks).toBe(true)
    expect(page.body).toBe('## Who can register\n\nText.')
    expect(page.frontmatter).toMatchObject({
      title: 'Register a birth',
      description: 'How to',
      lede: 'Lede',
      stage: 'alpha',
      service_type: 'digital',
      keywords: ['baby'],
      categories: ['family-birth-relationships'],
      visibility: 'public',
      form_id: 'register-birth',
    })
  })

  it('drops enum values landing does not know', async () => {
    const page = await fromApiV2(
      pageBody({
        frontmatter: { title: 'T', stage: 'beta', service_type: 'other' },
      }),
    )
    expect(page.frontmatter).not.toHaveProperty('stage')
    expect(page.frontmatter).not.toHaveProperty('service_type')
  })

  it('gives a /start page a <parent>/start slug', async () => {
    const page = await fromApiV2(
      pageBody({ url: '/family-birth-relationships/register-a-birth/start' }),
    )
    expect(page.slug).toBe('register-a-birth/start')
  })

  it('leaves form_id unset when the API has none', async () => {
    const page = await fromApiV2(pageBody())
    expect(page.frontmatter).not.toHaveProperty('form_id')
  })

  it('compiles the markdown with heading ids', async () => {
    const page = await fromApiV2(pageBody())
    const heading = findElement(page.hast.children, (el) => el.tagName === 'h2')
    expect(heading?.properties.id).toBe('who-can-register')
  })

  it('bakes the form id onto an href-less Start link', async () => {
    const page = await fromApiV2(
      pageBody({
        body_markdown: '<a data-start-link>Start now</a>',
        form_id: 'register-birth',
      }),
    )
    const link = findElement(
      page.hast.children,
      (el) => el.tagName === 'a' && el.properties.dataStartLink !== undefined,
    )
    expect(link?.properties.dataFormId).toBe('register-birth')
  })

  it('takes publish_date from published_at, never updated_at', async () => {
    const page = await fromApiV2(
      pageBody({
        published_at: '2026-01-02T00:00:00.000Z',
        updated_at: '2026-05-05T00:00:00.000Z',
      }),
    )
    expect(page.frontmatter.publish_date).toEqual(
      new Date('2026-01-02T00:00:00.000Z'),
    )
  })

  it('has no publish_date until the page has been published', async () => {
    const page = await fromApiV2(pageBody({ published_at: null }))
    expect(page.frontmatter).not.toHaveProperty('publish_date')
  })

  it('keeps an http(s) source_url and drops any other scheme', async () => {
    const withSource = (source_url: string) =>
      fromApiV2(pageBody({ frontmatter: { title: 'T', source_url } }))
    expect(
      (await withSource('https://gov.bb/old')).frontmatter.source_url,
    ).toBe('https://gov.bb/old')
    expect(
      (await withSource('javascript:alert(1)')).frontmatter,
    ).not.toHaveProperty('source_url')
  })
})

describe('resolveApiV2Page', () => {
  it('is a miss without fetching when api_v2 is not configured', async () => {
    const fetchImpl = stubFetch(jsonResponse(200, pageBody()))
    expect(await resolveApiV2Page(null, '/x', fetchImpl)).toEqual({
      kind: 'miss',
      reason: 'unconfigured',
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('compiles a hit into a page, keeping its Cache-Control', async () => {
    const result = await resolveApiV2Page(
      BASE,
      '/x',
      stubFetch(
        jsonResponse(200, pageBody(), { 'Cache-Control': 'max-age=60' }),
      ),
    )
    expect(result).toMatchObject({ kind: 'page', cacheControl: 'max-age=60' })
  })

  it('falls back (a cacheable compile miss) when the markdown fails to compile', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await resolveApiV2Page(
      BASE,
      '/x',
      stubFetch(
        jsonResponse(200, pageBody({ body_markdown: '::not-a-directive' }), {
          'Cache-Control': 'max-age=60',
        }),
      ),
    )
    expect(result).toEqual({
      kind: 'miss',
      reason: 'compile',
      cacheControl: 'max-age=60',
    })
    expect(logged(warn)).toMatchObject({
      event: 'api_v2_fallback',
      reason: 'compile',
      url: '/x',
      error: expect.any(String),
    })
  })
})

describe('contentSource', () => {
  it('is api_v2 for a page', async () => {
    const page = await fromApiV2(pageBody())
    expect(contentSource({ kind: 'page', page, cacheControl: null })).toBe(
      'api_v2',
    )
  })

  it.each<[ApiV2MissReason, string]>([
    ['unconfigured', 'static'],
    ['skipped', 'static'],
    ['not_found', 'static'],
    ['rejected', 'static'],
    ['bad_redirect', 'static-fallback'],
    ['compile', 'static-fallback'],
    ['no_target', 'static-fallback'],
    ['status', 'static-fallback'],
    ['malformed', 'static-fallback'],
    ['timeout', 'static-fallback'],
    ['network', 'static-fallback'],
    ['circuit_open', 'static-fallback'],
  ])('is %s → %s for a miss', (reason, source) => {
    expect(contentSource({ kind: 'miss', reason })).toBe(source)
  })
})
