import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { apiV2Breaker, readPublic } from './api-v2-reader'
import {
  EVERY_MS,
  createVersionWatch,
  fetchSiteVersion,
} from './api-v2-version'

afterEach(() => {
  apiV2Breaker.reset()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

/** A fake `read` returning each queued version in turn, then the last. */
function versions(...values: Array<string | null>) {
  let i = 0
  return vi.fn(async () => values[Math.min(i++, values.length - 1)] ?? null)
}

describe('createVersionWatch', () => {
  it('runs onChange whenever the version differs from the last one seen', async () => {
    const onChange = vi.fn()
    const check = createVersionWatch(versions('a', 'a', 'b'), onChange)
    await check(0)
    expect(onChange).toHaveBeenCalledTimes(1)
    await check(EVERY_MS)
    expect(onChange).toHaveBeenCalledTimes(1)
    await check(2 * EVERY_MS)
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('notices a publish made while its first read was failing', async () => {
    const onChange = vi.fn()
    const check = createVersionWatch(versions(null, 'b'), onChange)
    await check(0)
    expect(onChange).not.toHaveBeenCalled()
    await check(EVERY_MS)
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('reads at most once per interval', async () => {
    const read = versions('a')
    const check = createVersionWatch(read, vi.fn())
    await check(0)
    await check(EVERY_MS - 1)
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('shares one read between concurrent checks', async () => {
    const read = versions('a')
    const check = createVersionWatch(read, vi.fn())
    await Promise.all([check(0), check(0)])
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('ignores a failed read, so an outage expires nothing', async () => {
    const onChange = vi.fn()
    const check = createVersionWatch(versions('a', null, 'a'), onChange)
    for (const now of [0, EVERY_MS, 2 * EVERY_MS]) await check(now)
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})

describe('fetchSiteVersion', () => {
  const respond = (status: number, body: unknown) =>
    vi.fn(
      async () => new Response(JSON.stringify(body), { status }),
    ) as unknown as typeof fetch

  it('reads the version from api_v2', async () => {
    const fetchImpl = respond(200, { version: 'v1' })
    expect(await fetchSiteVersion('http://api', fetchImpl)).toBe('v1')
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://api/site-version',
      expect.anything(),
    )
  })

  it.each([
    ['an error status', respond(500, { error: 'internal_error' })],
    ['a body without a version', respond(200, {})],
    [
      'a network failure',
      vi.fn(async () => {
        throw new TypeError('fetch failed')
      }) as unknown as typeof fetch,
    ],
  ])('is null on %s', async (_, fetchImpl) => {
    expect(await fetchSiteVersion('http://api', fetchImpl)).toBeNull()
  })

  it('is null with no api_v2 configured', async () => {
    expect(await fetchSiteVersion(null)).toBeNull()
  })

  it('is null without a request while the breaker is open', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const failing = respond(503, {})
    for (let i = 0; i < 3; i++)
      await readPublic('http://api', '/x', z.object({}), failing)
    const fetchImpl = respond(200, { version: 'v1' })
    expect(await fetchSiteVersion('http://api', fetchImpl)).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('neither opens the breaker nor logs when it fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const failing = respond(500, { error: 'internal_error' })
    for (let i = 0; i < 4; i++)
      expect(await fetchSiteVersion('http://api', failing)).toBeNull()
    expect(failing).toHaveBeenCalledTimes(4)
    expect(apiV2Breaker.isOpen(Date.now())).toBe(false)
    expect(error).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })

  it('gives up after 300 ms, sooner than a page read', async () => {
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
    const version = fetchSiteVersion('http://api', hanging).finally(() => {
      settled = true
    })
    await vi.advanceTimersByTimeAsync(299)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(await version).toBeNull()
  })
})
