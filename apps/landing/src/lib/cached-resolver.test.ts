import { describe, expect, it, vi } from 'vitest'
import { resolveCachedValue } from './cached-resolver'
import type { CachedEntry } from './cached-resolver'

/** A tiny mutable cache slot, like the per-instance caches in the callers. */
function slot<T>(initial: CachedEntry<T> | null = null) {
  const ref: {
    current: CachedEntry<T> | null
    inFlight?: Promise<T>
  } = { current: initial }
  return {
    ref,
    getCached: () => ref.current,
    setCached: (e: CachedEntry<T>) => {
      ref.current = e
    },
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

describe('resolveCachedValue', () => {
  const TTL = 60_000

  it('returns the cached value without fetching when fresh', async () => {
    const { ref, getCached, setCached } = slot<string[]>({
      value: ['a'],
      fetchedAt: 1_000,
    })
    const fetcher = vi.fn()

    const value = await resolveCachedValue({
      now: 1_000 + TTL - 1,
      ttlMs: TTL,
      fetcher,
      getCached,
      setCached,
      cache: ref,
      emptyValue: [],
    })

    expect(value).toEqual(['a'])
    expect(fetcher).not.toHaveBeenCalled()
    expect(ref.current).toEqual({ value: ['a'], fetchedAt: 1_000 })
  })

  it('refetches and updates the cache when stale', async () => {
    const { ref, getCached, setCached } = slot<string[]>({
      value: ['old'],
      fetchedAt: 1_000,
    })
    const fetcher = vi.fn().mockResolvedValue(['new'])

    const value = await resolveCachedValue({
      now: 1_000 + TTL,
      ttlMs: TTL,
      fetcher,
      getCached,
      setCached,
      cache: ref,
      emptyValue: [],
    })

    expect(value).toEqual(['new'])
    expect(ref.current).toEqual({ value: ['new'], fetchedAt: 1_000 + TTL })
  })

  it('falls back to (and re-stamps) the last-known-good value when a refetch fails', async () => {
    const { ref, getCached, setCached } = slot<string[]>({
      value: ['good'],
      fetchedAt: 1_000,
    })
    const fetcher = vi.fn().mockRejectedValue(new Error('down'))

    const value = await resolveCachedValue({
      now: 1_000 + TTL,
      ttlMs: TTL,
      fetcher,
      getCached,
      setCached,
      cache: ref,
      emptyValue: [],
    })

    expect(value).toEqual(['good'])
    expect(ref.current).toEqual({ value: ['good'], fetchedAt: 1_000 + TTL })
  })

  it('returns emptyValue and calls onFetchFailure on a cold-start failure', async () => {
    const { ref, getCached, setCached } = slot<string[]>(null)
    const fetcher = vi.fn().mockRejectedValue(new Error('down'))
    const onFetchFailure = vi.fn()

    const value = await resolveCachedValue({
      now: 5_000,
      ttlMs: TTL,
      fetcher,
      getCached,
      setCached,
      cache: ref,
      emptyValue: [],
      onFetchFailure,
    })

    expect(value).toEqual([])
    expect(ref.current).toBeNull()
    expect(onFetchFailure).toHaveBeenCalledOnce()
  })

  it('retries a cold start (with no cache) then succeeds', async () => {
    const { ref, getCached, setCached } = slot<string[]>(null)
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValue(['recovered'])
    const sleep = vi.fn(async () => {})

    const value = await resolveCachedValue({
      now: 5_000,
      ttlMs: TTL,
      fetcher,
      getCached,
      setCached,
      cache: ref,
      emptyValue: [],
      coldStartRetries: 3,
      sleep,
    })

    expect(value).toEqual(['recovered'])
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledOnce()
  })

  it('does NOT retry when a stale cache is present to fall back on', async () => {
    const { ref, getCached, setCached } = slot<string[]>({
      value: ['good'],
      fetchedAt: 1_000,
    })
    const fetcher = vi.fn().mockRejectedValue(new Error('down'))
    const sleep = vi.fn(async () => {})

    await resolveCachedValue({
      now: 1_000 + TTL,
      ttlMs: TTL,
      fetcher,
      getCached,
      setCached,
      cache: ref,
      emptyValue: [],
      coldStartRetries: 3,
      sleep,
    })

    expect(fetcher).toHaveBeenCalledOnce()
    expect(sleep).not.toHaveBeenCalled()
  })

  it.each([null, { value: ['old'], fetchedAt: 0 }])(
    'shares one refresh across simultaneous requests with cache %j',
    async (initial) => {
      const { ref, getCached, setCached } = slot<string[]>(initial)
      const refresh = deferred<string[]>()
      const fetcher = vi.fn(() => refresh.promise)
      const options = {
        now: TTL,
        ttlMs: TTL,
        fetcher,
        getCached,
        setCached,
        cache: ref,
        emptyValue: [],
      }
      const requests = [
        resolveCachedValue(options),
        resolveCachedValue(options),
        resolveCachedValue(options),
      ]

      refresh.resolve(['new'])
      await expect(Promise.all(requests)).resolves.toEqual([
        ['new'],
        ['new'],
        ['new'],
      ])
      expect(fetcher).toHaveBeenCalledOnce()
      expect(ref.current).toEqual({ value: ['new'], fetchedAt: TTL })
    },
  )

  it('shares the entire cold-start retry sequence, including the backoff', async () => {
    const { ref, getCached, setCached } = slot<string[]>()
    const backoff = deferred<void>()
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValue(['recovered'])
    const sleep = vi.fn(() => backoff.promise)
    const options = {
      now: TTL,
      ttlMs: TTL,
      fetcher,
      getCached,
      setCached,
      cache: ref,
      emptyValue: [],
      coldStartRetries: 3,
      sleep,
    }
    const first = resolveCachedValue(options)
    await Promise.resolve()
    expect(sleep).toHaveBeenCalledWith(200)
    const second = resolveCachedValue(options)
    const third = resolveCachedValue(options)

    backoff.resolve()
    await expect(Promise.all([first, second, third])).resolves.toEqual([
      ['recovered'],
      ['recovered'],
      ['recovered'],
    ])
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledOnce()
  })

  it('warns once for shared exhausted retries and lets the next cold request recover', async () => {
    const { ref, getCached, setCached } = slot<string[]>()
    const fetcher = vi.fn().mockRejectedValue(new Error('down'))
    const onFetchFailure = vi.fn()
    const sleep = vi.fn(async () => {})
    const options = {
      now: TTL,
      ttlMs: TTL,
      fetcher,
      getCached,
      setCached,
      cache: ref,
      emptyValue: [],
      coldStartRetries: 3,
      sleep,
      onFetchFailure,
    }

    await expect(
      Promise.all([resolveCachedValue(options), resolveCachedValue(options)]),
    ).resolves.toEqual([[], []])
    expect(fetcher).toHaveBeenCalledTimes(4)
    expect(sleep.mock.calls).toEqual([[200], [500], [1000]])
    expect(onFetchFailure).toHaveBeenCalledOnce()
    expect(ref.current).toBeNull()

    fetcher.mockResolvedValue(['recovered'])
    await expect(resolveCachedValue(options)).resolves.toEqual(['recovered'])
    expect(fetcher).toHaveBeenCalledTimes(5)
  })

  it('does not let a late failure race a newer successful refresh', async () => {
    const { ref, getCached, setCached } = slot<string[]>({
      value: ['old'],
      fetchedAt: 0,
    })
    const failed = deferred<string[]>()
    const fetcher = vi
      .fn()
      .mockImplementationOnce(() => failed.promise)
      .mockResolvedValue(['new'])
    const options = {
      now: TTL,
      ttlMs: TTL,
      fetcher,
      getCached,
      setCached,
      cache: ref,
      emptyValue: [],
    }
    const first = resolveCachedValue(options)
    // Even a caller arriving a whole TTL later must join the pending refresh.
    const second = resolveCachedValue({ ...options, now: 2 * TTL })
    await Promise.resolve()
    failed.reject(new Error('late failure'))

    await expect(Promise.all([first, second])).resolves.toEqual([
      ['old'],
      ['old'],
    ])
    expect(fetcher).toHaveBeenCalledOnce()
    expect(ref.current).toEqual({ value: ['old'], fetchedAt: TTL })
    await expect(
      resolveCachedValue({ ...options, now: 2 * TTL }),
    ).resolves.toEqual(['new'])
    expect(ref.current).toEqual({ value: ['new'], fetchedAt: 2 * TTL })
    await expect(
      resolveCachedValue({ ...options, now: 2 * TTL + 1 }),
    ).resolves.toEqual(['new'])
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('is generic over the value type — works with a non-array value', async () => {
    const { ref, getCached, setCached } = slot<Record<string, string>>(null)
    const fetcher = vi.fn().mockResolvedValue({ a: 'x' })

    const value = await resolveCachedValue({
      now: 5_000,
      ttlMs: TTL,
      fetcher,
      getCached,
      setCached,
      cache: ref,
      emptyValue: {},
    })

    expect(value).toEqual({ a: 'x' })
    expect(ref.current).toEqual({ value: { a: 'x' }, fetchedAt: 5_000 })
  })
})
