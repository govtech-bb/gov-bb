import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Element, RootContent } from 'hast'
import type { ContentPage } from '../content/registry'
import {
  API_V2_TIMEOUT_MS,
  fetchApiV2Page,
  fromApiV2,
  resolveApiV2Base,
} from './api-v2-page'
import type { PageResponse } from './api-v2-page'

const BASE = 'http://api.example'

function pageBody(overrides: Partial<PageResponse> = {}): PageResponse {
  return {
    url: '/family-birth-relationships/register-a-birth',
    frontmatter: { title: 'Register a birth', description: 'How to' },
    body_markdown: '## Who can register\n\nText.',
    form_id: null,
    hide_start_links: false,
    breadcrumbs: [],
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
    expect(result).toEqual({ kind: 'page', body })
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe(`${BASE}/pages?url=%2Fa%20b`)
    expect(init.redirect).toBe('manual')
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('treats a 404 as a silent miss', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await fetchApiV2Page(
      BASE,
      '/x',
      stubFetch(jsonResponse(404, { error: 'not found' })),
    )
    expect(result).toEqual({ kind: 'miss' })
    expect(warn).not.toHaveBeenCalled()
  })

  it('treats a 500 as a miss and warns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await fetchApiV2Page(
      BASE,
      '/x',
      stubFetch(jsonResponse(500, {})),
    )
    expect(result).toEqual({ kind: 'miss' })
    expect(warn).toHaveBeenCalled()
  })

  it('treats a network error as a miss and warns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await fetchApiV2Page(
      BASE,
      '/x',
      stubFetch(new TypeError('fetch failed')),
    )
    expect(result).toEqual({ kind: 'miss' })
    expect(warn).toHaveBeenCalled()
  })

  it('treats a timeout as a miss', async () => {
    vi.useFakeTimers()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
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
    expect(await pending).toEqual({ kind: 'miss' })
    expect(warn).toHaveBeenCalled()
  })

  it('treats an unparseable 200 body as a miss', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await fetchApiV2Page(
      BASE,
      '/x',
      stubFetch(new Response('<html>', { status: 200 })),
    )
    expect(result).toEqual({ kind: 'miss' })
  })

  it('treats a malformed 200 body as a miss', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await fetchApiV2Page(
      BASE,
      '/x',
      stubFetch(jsonResponse(200, { url: '/x', frontmatter: {} })),
    )
    expect(result).toEqual({ kind: 'miss' })
  })

  it('maps a 301 to a redirect from the body', async () => {
    const result = await fetchApiV2Page(
      BASE,
      '/old',
      stubFetch(
        jsonResponse(301, { redirect: '/new' }, { Location: '/elsewhere' }),
      ),
    )
    expect(result).toEqual({ kind: 'redirect', to: '/new' })
  })

  it('falls back to the Location header for a 301 with no body redirect', async () => {
    const result = await fetchApiV2Page(
      BASE,
      '/old',
      stubFetch(
        new Response(null, { status: 301, headers: { Location: '/new' } }),
      ),
    )
    expect(result).toEqual({ kind: 'redirect', to: '/new' })
  })

  it('treats a 301 with no target as a miss', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await fetchApiV2Page(
      BASE,
      '/old',
      stubFetch(jsonResponse(301, {})),
    )
    expect(result).toEqual({ kind: 'miss' })
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

  it('takes publish_date from the static twin, and has none without one', async () => {
    const date = new Date('2026-01-02T00:00:00Z')
    const staticPage = {
      frontmatter: { publish_date: date },
    } as ContentPage
    expect(
      (await fromApiV2(pageBody(), staticPage)).frontmatter.publish_date,
    ).toEqual(date)
    expect((await fromApiV2(pageBody())).frontmatter).not.toHaveProperty(
      'publish_date',
    )
  })
})
