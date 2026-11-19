import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchJsonWithTimeout } from './fetch-json-with-timeout'

describe('fetchJsonWithTimeout', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('uses one deadline for delayed headers and a stalled JSON body', async () => {
    let signal: AbortSignal | null | undefined
    let response: Response | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>((_url, options) => {
        signal = options?.signal
        return new Promise((resolve) => {
          setTimeout(() => {
            response = new Response(
              new ReadableStream({
                start(controller) {
                  controller.enqueue(new TextEncoder().encode('{"data":['))
                  signal?.addEventListener('abort', () => {
                    controller.error(signal?.reason)
                  })
                },
              }),
            )
            resolve(response)
          }, 5_000)
        })
      }),
    )

    const pending = fetchJsonWithTimeout('https://example.test/feed', 15_000)
    const rejected = expect(pending).rejects.toMatchObject({
      name: 'AbortError',
    })
    await vi.advanceTimersByTimeAsync(5_000)
    expect(response?.bodyUsed).toBe(true)
    await vi.advanceTimersByTimeAsync(9_999)
    expect(signal?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(signal?.aborted).toBe(true)
    await rejected
    expect(vi.getTimerCount()).toBe(0)
  })

  it('clears the deadline after consuming a successful JSON response', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ a: 1 }))
    vi.stubGlobal('fetch', fetcher)

    await expect(
      fetchJsonWithTimeout('https://example.test/feed', 15_000),
    ).resolves.toEqual({ a: 1 })
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(15_000)
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(false)
  })

  it.each([
    {
      name: 'HTTP error',
      response: () =>
        new Response('', { status: 503, statusText: 'Service Unavailable' }),
      error: /HTTP 503 Service Unavailable/,
    },
    {
      name: 'invalid JSON',
      response: () => new Response('not JSON'),
      error: SyntaxError,
    },
  ])('clears the deadline after $name', async ({ response, error }) => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(response()))

    await expect(
      fetchJsonWithTimeout('https://example.test/feed', 15_000),
    ).rejects.toThrow(error)
    expect(vi.getTimerCount()).toBe(0)
  })
})
