import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createApiV2Cache } from './api-v2-cache'
import { loadApiV2Page } from './api-v2-page'
import {
  API_V2_TIMEOUT_MS,
  apiV2Breaker,
  readApiV2,
  readPublic,
} from './api-v2-reader'

const BASE = 'http://api.example'
const Body = z.object({ ok: z.boolean() })

/** A fake `fetch` answering every request with `status` and `body`. */
const answering = (status: number, body: BodyInit | null = '{}') =>
  vi.fn<typeof fetch>(async () => new Response(body, { status }))

const read = (fetchImpl: typeof fetch, token?: string) =>
  readPublic(BASE, '/x', Body, fetchImpl, token)

/** Every console line through `spy`, parsed. */
const lines = (spy: ReturnType<typeof vi.spyOn>) =>
  spy.mock.calls.map((call: unknown[]) => JSON.parse(String(call[0])))

afterEach(() => {
  apiV2Breaker.reset()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('readPublic', () => {
  it('reads the path, parsed', async () => {
    const fetchImpl = answering(200, '{"ok":true,"extra":1}')
    expect(await read(fetchImpl)).toEqual({
      kind: 'ok',
      value: { ok: true },
      cacheControl: null,
    })
    expect(fetchImpl.mock.calls[0][0]).toBe(`${BASE}/x`)
  })

  it("sends landing's token only when one is configured", async () => {
    const fetchImpl = answering(200, '{"ok":true}')
    await read(fetchImpl)
    await read(fetchImpl, 'secret')
    const header = (i: number) =>
      new Headers(fetchImpl.mock.calls[i][1]?.headers).get('x-landing-token')
    expect(header(0)).toBeNull()
    expect(header(1)).toBe('secret')
  })

  it('is a silent not_found miss on a 404', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await read(answering(404))).toEqual({
      kind: 'miss',
      reason: 'not_found',
      cacheControl: null,
    })
    expect(error).not.toHaveBeenCalled()
  })

  it.each([404, 503])('releases the unread body of a %i', async (status) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const cancel = vi.fn()
    await read(answering(status, new ReadableStream({ cancel })))
    expect(cancel).toHaveBeenCalledOnce()
  })

  it.each([400, 401, 403])(
    'is a rejected miss on a %i, logged at warn',
    async (status) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(await read(answering(status))).toEqual({
        kind: 'miss',
        reason: 'rejected',
        cacheControl: null,
      })
      expect(lines(warn)).toEqual([
        { event: 'api_v2_fallback', reason: 'rejected', url: '/x', status },
      ])
    },
  )

  it.each([408, 429, 500, 503])(
    'is a status miss on a %i, logged at error',
    async (status) => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      expect(await read(answering(status))).toEqual({
        kind: 'miss',
        reason: 'status',
      })
      expect(lines(error)).toEqual([
        { event: 'api_v2_fallback', reason: 'status', url: '/x', status },
      ])
    },
  )

  it.each([
    ['not JSON', '<html>'],
    ['the wrong shape', '{"ok":"yes"}'],
  ])('is a malformed miss when the body is %s', async (_, body) => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await read(answering(200, body))).toEqual({
      kind: 'miss',
      reason: 'malformed',
    })
    expect(lines(error)).toEqual([
      { event: 'api_v2_fallback', reason: 'malformed', url: '/x' },
    ])
  })

  it('is a network miss when api_v2 cannot be reached, with the cause', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new TypeError('fetch failed', {
        cause: new Error('connect ECONNREFUSED'),
      })
    })
    expect(await read(fetchImpl)).toEqual({ kind: 'miss', reason: 'network' })
    expect(lines(error)).toEqual([
      {
        event: 'api_v2_fallback',
        reason: 'network',
        url: '/x',
        error: 'fetch failed: connect ECONNREFUSED',
      },
    ])
  })

  it(`is a timeout miss when api_v2 doesn't answer in ${API_V2_TIMEOUT_MS} ms`, async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const fetchImpl = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) =>
          init?.signal?.addEventListener('abort', () =>
            reject(init.signal?.reason),
          ),
        ),
    )
    const result = read(fetchImpl)
    await vi.advanceTimersByTimeAsync(API_V2_TIMEOUT_MS)
    expect(await result).toEqual({ kind: 'miss', reason: 'timeout' })
    expect(lines(error)).toMatchObject([
      { event: 'api_v2_fallback', reason: 'timeout', url: '/x' },
    ])
  })
})

describe('readApiV2', () => {
  it("passes an answer's Cache-Control through", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () =>
        new Response('{"ok":true}', {
          headers: { 'Cache-Control': 'max-age=60' },
        }),
    )
    expect(await readApiV2(BASE, '/x', Body, fetchImpl)).toEqual({
      kind: 'ok',
      value: { ok: true },
      cacheControl: 'max-age=60',
    })
  })

  it("sends a reviewer's preview token, and the redirect mode asked for", async () => {
    const fetchImpl = answering(200, '{"ok":true}')
    await readApiV2(BASE, '/x', Body, fetchImpl, {
      landingToken: 'landing',
      previewToken: 'preview',
      redirect: 'manual',
    })
    const init = fetchImpl.mock.calls[0][1]
    const headers = new Headers(init?.headers)
    expect(headers.get('x-landing-token')).toBe('landing')
    expect(headers.get('x-preview-token')).toBe('preview')
    expect(init?.redirect).toBe('manual')
  })

  it('logs under the url it is given', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    await readApiV2(BASE, '/pages?url=%2Fa', Body, answering(503), {
      logUrl: '/a',
    })
    expect(lines(error)).toEqual([
      { event: 'api_v2_fallback', reason: 'status', url: '/a', status: 503 },
    ])
  })

  it("returns the caller's reading of an answer, or leaves the answer to the reader", async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const answer = async (response: Response) =>
      response.status === 301 ? ({ kind: 'moved' } as const) : undefined
    expect(
      await readApiV2(BASE, '/x', Body, answering(301), { answer }),
    ).toEqual({ kind: 'moved' })
    expect(
      await readApiV2(BASE, '/x', Body, answering(503), { answer }),
    ).toEqual({ kind: 'miss', reason: 'status' })
    expect(error).toHaveBeenCalledOnce()
  })

  it("times out the caller's reading of an answer", async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const result = readApiV2(BASE, '/x', Body, answering(301), {
      answer: (_response, signal) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener('abort', () => reject(signal.reason)),
        ),
    })
    await vi.advanceTimersByTimeAsync(API_V2_TIMEOUT_MS)
    expect(await result).toEqual({ kind: 'miss', reason: 'timeout' })
    expect(lines(error)).toMatchObject([{ reason: 'timeout', url: '/x' }])
  })

  it('gives up after the timeout it is given', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const hanging = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) =>
          init?.signal?.addEventListener('abort', () =>
            reject(init.signal?.reason),
          ),
        ),
    )
    let settled = false
    const result = readApiV2(BASE, '/x', Body, hanging, {
      timeoutMs: 100,
    }).finally(() => {
      settled = true
    })
    await vi.advanceTimersByTimeAsync(99)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(await result).toEqual({ kind: 'miss', reason: 'timeout' })
  })

  it.each([
    ['status', answering(503)],
    ['rejected', answering(400)],
    ['malformed', answering(200, '<html>')],
    [
      'network',
      vi.fn<typeof fetch>(async () => {
        throw new TypeError('fetch failed')
      }),
    ],
  ])(
    'classes a quiet %s miss the same, without a line',
    async (reason, fetchImpl) => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(
        await readApiV2(BASE, '/x', Body, fetchImpl, { quiet: true }),
      ).toMatchObject({ kind: 'miss', reason })
      expect(error).not.toHaveBeenCalled()
      expect(warn).not.toHaveBeenCalled()
    },
  )

  it('neither checks nor counts the breaker', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const failing = answering(503)
    for (let i = 0; i < 4; i++) await readApiV2(BASE, '/x', Body, failing)
    expect(failing).toHaveBeenCalledTimes(4)
    const fetchImpl = answering(200, '{"ok":true}')
    await read(fetchImpl)
    expect(fetchImpl).toHaveBeenCalledOnce()
  })
})

describe('the breaker', () => {
  it('opens after three failures, turning reads away without a request or a line, for 30 s', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const failing = answering(503)
    for (let i = 0; i < 3; i++) await read(failing)
    expect(lines(error).at(-1)).toEqual({
      event: 'api_v2_circuit_open',
      url: '/x',
    })
    error.mockClear()

    vi.advanceTimersByTime(29_999)
    expect(await read(failing)).toEqual({
      kind: 'miss',
      reason: 'circuit_open',
    })
    expect(failing).toHaveBeenCalledTimes(3)
    expect(error).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    const healthy = answering(200, '{"ok":true}')
    expect(await read(healthy)).toEqual({
      kind: 'ok',
      value: { ok: true },
      cacheControl: null,
    })
  })

  it('starts counting again after any answer, a 404 included', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const failing = answering(503)
    for (const answer of [answering(200, '{"ok":true}'), answering(404)]) {
      await read(failing)
      await read(failing)
      await read(answer)
    }
    await read(failing)
    expect(failing).toHaveBeenCalledTimes(5)
  })

  it('is not opened by rejected requests: api_v2 answered', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    for (let i = 0; i < 3; i++) await read(answering(400))
    const fetchImpl = answering(200, '{"ok":true}')
    expect(await read(fetchImpl)).toEqual({
      kind: 'ok',
      value: { ok: true },
      cacheControl: null,
    })
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('is the one the page cache uses', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const pages = createApiV2Cache(apiV2Breaker)
    const resolvePage = vi.fn(async () => ({
      kind: 'miss' as const,
      reason: 'network' as const,
    }))
    for (const url of ['/a', '/b', '/c']) await pages.get(url, resolvePage)

    const fetchImpl = answering(200, '{"ok":true}')
    expect(await read(fetchImpl)).toEqual({
      kind: 'miss',
      reason: 'circuit_open',
    })
    expect(fetchImpl).not.toHaveBeenCalled()

    apiV2Breaker.reset()
    for (let i = 0; i < 3; i++) await read(answering(503))
    expect(await pages.get('/d', resolvePage)).toEqual({
      kind: 'miss',
      reason: 'circuit_open',
    })
    expect(resolvePage).toHaveBeenCalledTimes(3)
  })

  it('lets a reviewer page read out while it is open, and never counts one', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const pages = createApiV2Cache(apiV2Breaker)
    const failing = answering(503)
    const load = (url: string, previewToken?: string) =>
      loadApiV2Page(pages, BASE, url, undefined, previewToken, failing)

    // Two public failures, then a reviewer's: the breaker stays closed.
    await load('/a')
    await load('/b')
    expect(await load('/c', 'secret')).toEqual({
      kind: 'miss',
      reason: 'status',
    })
    const fetchImpl = answering(200, '{"ok":true}')
    await read(fetchImpl)
    expect(fetchImpl).toHaveBeenCalledOnce()

    // Open: public reads are turned away, a reviewer's still goes out.
    for (const url of ['/d', '/e', '/f']) await load(url)
    expect(await load('/g')).toEqual({ kind: 'miss', reason: 'circuit_open' })
    const calls = failing.mock.calls.length
    expect(await load('/g', 'secret')).toEqual({
      kind: 'miss',
      reason: 'status',
    })
    expect(failing).toHaveBeenCalledTimes(calls + 1)
  })
})
