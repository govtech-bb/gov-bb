import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PageResponse } from '@govtech-bb/landing-v2-contract'
import { fetchPage, resolvePage } from './content-api'
import type { PageResult } from './content-api'
import type { CachedEntry } from './cached-resolver'
import indexPageFixture from '../fixtures/get-birth-certificate.json'

// The JSON's inferred types don't satisfy the contract's hast literal unions
// (e.g. `type: string`); assert once here.
const page = indexPageFixture as PageResponse

const BASE = 'http://content-api.test'

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

describe('fetchPage', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.stubEnv('CONTENT_API_URL', BASE)
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('maps a 200 to the page', async () => {
    fetchMock.mockResolvedValue(jsonResponse(page, 200))

    await expect(fetchPage(page.url)).resolves.toEqual({ kind: 'page', page })
  })

  it('requests /pages with the URL-encoded path and does not follow redirects', async () => {
    fetchMock.mockResolvedValue(jsonResponse(page, 200))

    await fetchPage('family-birth-relationships/get-birth-certificate')

    expect(fetchMock).toHaveBeenCalledOnce()
    const [requestUrl, init] = fetchMock.mock.calls[0]
    expect(requestUrl).toBe(
      `${BASE}/pages?url=${encodeURIComponent('family-birth-relationships/get-birth-certificate')}`,
    )
    expect(init).toMatchObject({ redirect: 'manual' })
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('trims a trailing slash off the base URL', async () => {
    vi.stubEnv('CONTENT_API_URL', `${BASE}/`)
    fetchMock.mockResolvedValue(jsonResponse(page, 200))

    await fetchPage('a/b')

    expect(fetchMock.mock.calls[0][0]).toBe(
      `${BASE}/pages?url=${encodeURIComponent('a/b')}`,
    )
  })

  it.each([
    ['without frontmatter and hast', { url: 'a/b' }],
    ['that is null', null],
    ['without url', { ...page, url: undefined }],
    ['whose breadcrumbs are not an array', { ...page, breadcrumbs: 'x' }],
  ])('throws on a 200 body %s', async (_, body) => {
    fetchMock.mockResolvedValue(jsonResponse(body, 200))

    await expect(fetchPage('a/b')).rejects.toThrow()
  })

  it("maps a 301 to a redirect to the body's `redirect`", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ redirect: '/a/get-thing' }), {
        status: 301,
        headers: {
          Location: '/a/get-thing',
          'Content-Type': 'application/json; charset=utf-8',
        },
      }),
    )

    await expect(fetchPage('get-thing')).resolves.toEqual({
      kind: 'redirect',
      to: '/a/get-thing',
    })
  })

  it('accepts a 301 to a site path', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ redirect: '/family-birth-relationships/x' }, 301),
    )

    await expect(fetchPage('x')).resolves.toEqual({
      kind: 'redirect',
      to: '/family-birth-relationships/x',
    })
  })

  it.each([
    ['without `redirect`', {}],
    ['whose `redirect` is not a site path', { redirect: 'a/get-thing' }],
    ['whose `redirect` is protocol-relative', { redirect: '//evil.example/x' }],
    ['whose `redirect` starts with a backslash', { redirect: '/\\evil' }],
  ])('throws on a 301 body %s', async (_, body) => {
    fetchMock.mockResolvedValue(jsonResponse(body, 301))

    await expect(fetchPage('get-thing')).rejects.toThrow()
  })

  it.each([404, 400])(
    'maps a %i to not-found without throwing, whatever the body, and releases the body',
    async (status) => {
      const response = new Response('<html>not json</html>', { status })
      fetchMock.mockResolvedValue(response)

      await expect(fetchPage('no-such-page')).resolves.toEqual({
        kind: 'not-found',
      })
      expect(response.bodyUsed).toBe(true)
    },
  )

  it.each([401, 403, 429, 500, 503])(
    'throws on any other status (%i) and releases the body',
    async (status) => {
      const response = jsonResponse({ error: 'boom' }, status)
      fetchMock.mockResolvedValue(response)

      await expect(fetchPage('a/b')).rejects.toThrow(String(status))
      expect(response.bodyUsed).toBe(true)
    },
  )

  it('throws on a network error', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))

    await expect(fetchPage('a/b')).rejects.toThrow('fetch failed')
  })

  it('throws on invalid JSON in a 200', async () => {
    fetchMock.mockResolvedValue(
      new Response('<html>oops</html>', { status: 200 }),
    )

    await expect(fetchPage('a/b')).rejects.toThrow()
  })

  it('throws naming CONTENT_API_URL when it is not set, without fetching', async () => {
    vi.stubEnv('CONTENT_API_URL', undefined)

    await expect(fetchPage('a/b')).rejects.toThrow('CONTENT_API_URL')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('resolvePage', () => {
  const TTL = 60_000
  const pageResult: PageResult = { kind: 'page', page }
  const down = () => Promise.reject(new Error('down'))
  const noSleep = async () => {}

  let cache: Map<string, CachedEntry<PageResult>>

  beforeEach(() => {
    cache = new Map()
  })

  it('serves a fresh entry without fetching', async () => {
    await resolvePage({
      url: 'a/b',
      now: 0,
      fetcher: async () => pageResult,
      cache,
    })
    const fetcher = vi.fn(down)

    const result = await resolvePage({
      url: 'a/b',
      now: TTL - 1,
      fetcher,
      cache,
    })

    expect(result).toEqual(pageResult)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('keeps serving the last-known-good page when a stale refetch throws', async () => {
    await resolvePage({
      url: 'a/b',
      now: 0,
      fetcher: async () => pageResult,
      cache,
    })
    const fetcher = vi.fn(down)

    const result = await resolvePage({ url: 'a/b', now: TTL, fetcher, cache })

    expect(result).toEqual(pageResult)
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('yields unavailable on a cold miss once every retry has thrown', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fetcher = vi.fn(down)
    const sleep = vi.fn(noSleep)

    const result = await resolvePage({
      url: 'a/b',
      now: 0,
      fetcher,
      cache,
      sleep,
    })

    expect(result).toEqual({ kind: 'unavailable' })
    expect(fetcher).toHaveBeenCalledTimes(4)
    expect(sleep).toHaveBeenCalledTimes(3)
    expect(cache.size).toBe(0)
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })

  it('caches a not-found like any other result', async () => {
    await resolvePage({
      url: 'no-such-page',
      now: 0,
      fetcher: async () => ({ kind: 'not-found' }),
      cache,
    })
    const fetcher = vi.fn(down)

    const result = await resolvePage({
      url: 'no-such-page',
      now: 1,
      fetcher,
      cache,
    })

    expect(result).toEqual({ kind: 'not-found' })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('keys by the URL with leading/trailing slashes trimmed', async () => {
    const fetcher = vi.fn(async () => pageResult)

    await resolvePage({ url: '/a/b/', now: 0, fetcher, cache })
    await resolvePage({ url: 'a/b', now: 1, fetcher, cache })

    expect(fetcher).toHaveBeenCalledOnce()
    expect(fetcher).toHaveBeenCalledWith('a/b')
    expect([...cache.keys()]).toEqual(['a/b'])
  })

  it("never serves one URL's cached page for another", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await resolvePage({
      url: 'a/b',
      now: 0,
      fetcher: async () => pageResult,
      cache,
    })

    const result = await resolvePage({
      url: 'a/c',
      now: 1,
      fetcher: down,
      cache,
      sleep: noSleep,
    })

    expect(result).toEqual({ kind: 'unavailable' })
    warn.mockRestore()
  })
})
