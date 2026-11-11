import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { API_V2_TIMEOUT_MS, readPublic } from './api-v2-reader'

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
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('readPublic', () => {
  it('reads the path, parsed', async () => {
    const fetchImpl = answering(200, '{"ok":true,"extra":1}')
    expect(await read(fetchImpl)).toEqual({ kind: 'ok', value: { ok: true } })
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
    })
    expect(error).not.toHaveBeenCalled()
  })

  it.each([404, 503])('releases the unread body of a %i', async (status) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const cancel = vi.fn()
    await read(answering(status, new ReadableStream({ cancel })))
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('is a status miss on any other status, logged at error', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await read(answering(503))).toEqual({
      kind: 'miss',
      reason: 'status',
    })
    expect(lines(error)).toEqual([
      { event: 'api_v2_fallback', reason: 'status', url: '/x', status: 503 },
    ])
  })

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
