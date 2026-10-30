import { describe, expect, it, vi } from 'vitest'
import {
  EVERY_MS,
  createVersionWatch,
  fetchSiteVersion,
} from './api-v2-version'

/** A fake `read` returning each queued version in turn, then the last. */
function versions(...values: Array<string | null>) {
  let i = 0
  return vi.fn(async () => values[Math.min(i++, values.length - 1)] ?? null)
}

describe('createVersionWatch', () => {
  it('runs onChange when the version moves, not on the first read', async () => {
    const onChange = vi.fn()
    const check = createVersionWatch(versions('a', 'a', 'b'), onChange)
    await check(0)
    await check(EVERY_MS)
    expect(onChange).not.toHaveBeenCalled()
    await check(2 * EVERY_MS)
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
    expect(onChange).not.toHaveBeenCalled()
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
})
