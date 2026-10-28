import { describe, expect, it, vi } from 'vitest'
import { MAX_ENTRIES, createApiV2Cache } from './api-v2-cache'
import type { ApiV2Page, ApiV2Result } from './api-v2-page'

const PAGE_CC = 'public, max-age=60, stale-while-revalidate=300'

function redirect(to: string, cacheControl: string | null = PAGE_CC) {
  return { kind: 'redirect', to, cacheControl } as const
}

/** A fake `resolve` returning each queued result in turn, then the last. */
function resolver(...results: Array<ApiV2Result>) {
  let i = 0
  return vi.fn(async () => results[Math.min(i++, results.length - 1)])
}

describe('createApiV2Cache', () => {
  it('serves a second read within max-age from the cache', async () => {
    const cache = createApiV2Cache()
    const resolve = resolver(redirect('/a'))
    const first = await cache.get('/x', resolve, 0)
    const second = await cache.get('/x', resolve, 59_999)
    expect(resolve).toHaveBeenCalledTimes(1)
    expect(second).toBe(first)
  })

  it('serves the old result at once past max-age and revalidates in the background', async () => {
    const cache = createApiV2Cache()
    const resolve = resolver(redirect('/old'), redirect('/new'))
    await cache.get('/x', resolve, 0)
    expect(await cache.get('/x', resolve, 60_000)).toMatchObject({
      to: '/old',
    })
    expect(resolve).toHaveBeenCalledTimes(2)
    await new Promise((r) => setTimeout(r)) // let the background refetch land
    expect(await cache.get('/x', resolve, 60_001)).toMatchObject({
      to: '/new',
    })
  })

  it('serves the old result past the SWR window when the refetch fails', async () => {
    const cache = createApiV2Cache()
    const old = redirect('/old')
    const resolve = resolver(old, { kind: 'miss', reason: 'timeout' })
    await cache.get('/x', resolve, 0)
    expect(await cache.get('/x', resolve, 360_000)).toBe(old)
    expect(resolve).toHaveBeenCalledTimes(2)
  })

  it('caches a 404 for its own max-age', async () => {
    const cache = createApiV2Cache()
    const resolve = resolver({
      kind: 'miss',
      reason: 'not_found',
      cacheControl: 'public, max-age=10',
    })
    await cache.get('/x', resolve, 0)
    await cache.get('/x', resolve, 9_999)
    expect(resolve).toHaveBeenCalledTimes(1)
    await cache.get('/x', resolve, 10_000)
    expect(resolve).toHaveBeenCalledTimes(2)
  })

  it('does not cache a 404 with no Cache-Control', async () => {
    const cache = createApiV2Cache()
    const resolve = resolver({
      kind: 'miss',
      reason: 'not_found',
      cacheControl: null,
    })
    await cache.get('/x', resolve, 0)
    await cache.get('/x', resolve, 1)
    expect(resolve).toHaveBeenCalledTimes(2)
  })

  it.each(['timeout', 'network', 'status', 'malformed', 'no_target'] as const)(
    'never caches a %s failure and returns it when nothing is cached',
    async (reason) => {
      const cache = createApiV2Cache()
      const resolve = resolver({ kind: 'miss', reason })
      expect(await cache.get('/x', resolve, 0)).toEqual({
        kind: 'miss',
        reason,
      })
      await cache.get('/x', resolve, 1)
      expect(resolve).toHaveBeenCalledTimes(2)
    },
  )

  it('opens the breaker for 30 s after three failures in a row', async () => {
    const cache = createApiV2Cache()
    const cached = redirect('/cached')
    await cache.get('/cached', resolver(cached), 0)
    const failing = resolver({ kind: 'miss', reason: 'network' })
    for (const url of ['/a', '/b', '/c']) await cache.get(url, failing, 1_000)
    expect(failing).toHaveBeenCalledTimes(3)

    expect(await cache.get('/d', failing, 1_001)).toEqual({
      kind: 'miss',
      reason: 'circuit_open',
    })
    // Any age while open: past the SWR window, no call either.
    expect(await cache.get('/cached', failing, 30_999)).toBe(cached)
    expect(failing).toHaveBeenCalledTimes(3)

    await cache.get('/d', failing, 31_000)
    expect(failing).toHaveBeenCalledTimes(4)
  })

  it('logs one circuit_open error when the breaker trips, not per short-circuited read', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const cache = createApiV2Cache()
    const failing = resolver({ kind: 'miss', reason: 'network' })
    for (const url of ['/a', '/b', '/c']) await cache.get(url, failing, 0)
    for (const url of ['/d', '/e']) await cache.get(url, failing, 1)
    expect(error).toHaveBeenCalledTimes(1)
    expect(JSON.parse(error.mock.calls[0][0] as string)).toEqual({
      event: 'api_v2_fallback',
      reason: 'circuit_open',
      url: '/c',
    })
    error.mockRestore()
  })

  it('resets the failure count on a success', async () => {
    const cache = createApiV2Cache()
    const failing = resolver({ kind: 'miss', reason: 'network' })
    await cache.get('/a', failing, 0)
    await cache.get('/b', failing, 0)
    await cache.get('/ok', resolver(redirect('/ok')), 0)
    await cache.get('/c', failing, 0)
    await cache.get('/d', failing, 0)
    expect(failing).toHaveBeenCalledTimes(4)
  })

  it.each([
    { kind: 'miss', reason: 'compile', cacheControl: PAGE_CC },
    { kind: 'miss', reason: 'bad_redirect', cacheControl: PAGE_CC },
  ] as const)(
    'caches a $reason miss without tripping the breaker',
    async (miss) => {
      const cache = createApiV2Cache()
      const resolve = resolver(miss)
      for (const url of ['/a', '/b', '/c', '/d'])
        await cache.get(url, resolve, 0)
      await cache.get('/a', resolve, 1)
      expect(resolve).toHaveBeenCalledTimes(4)
    },
  )

  it('does not count a 4xx (api_v2 answering) toward the breaker', async () => {
    const cache = createApiV2Cache()
    const resolve = resolver({
      kind: 'miss',
      reason: 'rejected',
      cacheControl: null,
    })
    for (const url of ['/a', '/b', '/c', '/d']) await cache.get(url, resolve, 0)
    expect(resolve).toHaveBeenCalledTimes(4)
  })

  it('ignores failures that land after the breaker opened', async () => {
    const cache = createApiV2Cache()
    const failing = resolver({ kind: 'miss', reason: 'timeout' })
    await Promise.all(
      ['/a', '/b', '/c', '/d'].map((url) => cache.get(url, failing, 0)),
    )
    // After the window it takes three new failures to re-open.
    for (const url of ['/e', '/f', '/g']) await cache.get(url, failing, 30_000)
    expect(failing).toHaveBeenCalledTimes(7)
  })

  it('makes one call for concurrent reads of an uncached url', async () => {
    const cache = createApiV2Cache()
    const resolve = resolver(redirect('/a'))
    await Promise.all(
      Array.from({ length: 10 }, () => cache.get('/x', resolve, 0)),
    )
    expect(resolve).toHaveBeenCalledTimes(1)
  })

  it('drops a cached entry when a refetch says no-store', async () => {
    const cache = createApiV2Cache()
    const resolve = resolver(redirect('/a'), redirect('/b', 'no-store'))
    await cache.get('/x', resolve, 0)
    await cache.get('/x', resolve, 360_000)
    await cache.get('/x', resolve, 360_001)
    expect(resolve).toHaveBeenCalledTimes(3)
  })

  it(`evicts the oldest entry past ${MAX_ENTRIES} urls`, async () => {
    const cache = createApiV2Cache()
    const resolve = resolver(redirect('/a'))
    for (let i = 0; i <= MAX_ENTRIES; i++) await cache.get(`/${i}`, resolve, 0)
    await cache.get(`/${MAX_ENTRIES}`, resolve, 1)
    expect(resolve).toHaveBeenCalledTimes(MAX_ENTRIES + 1)
    await cache.get('/0', resolve, 1)
    expect(resolve).toHaveBeenCalledTimes(MAX_ENTRIES + 2)
  })

  it('evicts the oldest non-page before any page', async () => {
    const cache = createApiV2Cache()
    const page = resolver({
      kind: 'page',
      page: {} as ApiV2Page,
      cacheControl: PAGE_CC,
    })
    const notFound = resolver({
      kind: 'miss',
      reason: 'not_found',
      cacheControl: 'public, max-age=10',
    })
    await cache.get('/page', page, 0)
    for (let i = 0; i < MAX_ENTRIES; i++)
      await cache.get(`/junk-${i}`, notFound, 0)
    await cache.get('/page', page, 1)
    expect(page).toHaveBeenCalledTimes(1)
    await cache.get('/junk-0', notFound, 1)
    expect(notFound).toHaveBeenCalledTimes(MAX_ENTRIES + 1)
  })
})
