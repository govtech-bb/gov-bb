import { describe, expect, it, vi } from 'vitest'
import { resolveCachedValue } from './cached-resolver'
import type { CachedEntry } from './cached-resolver'

/** A tiny mutable cache slot, like the per-instance caches in the callers. */
function slot<T>(initial: CachedEntry<T> | null = null) {
  const ref: { current: CachedEntry<T> | null } = { current: initial }
  return {
    ref,
    getCached: () => ref.current,
    setCached: (e: CachedEntry<T>) => {
      ref.current = e
    },
  }
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
      emptyValue: [],
      onFetchFailure,
    })

    expect(value).toEqual([])
    expect(ref.current).toBeNull()
    expect(onFetchFailure).toHaveBeenCalledOnce()
  })

  it('retries a cold start (with no cache) then succeeds', async () => {
    const { getCached, setCached } = slot<string[]>(null)
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
      emptyValue: [],
      coldStartRetries: 3,
      sleep,
    })

    expect(value).toEqual(['recovered'])
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledOnce()
  })

  it('does NOT retry when a stale cache is present to fall back on', async () => {
    const { getCached, setCached } = slot<string[]>({
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
      emptyValue: [],
      coldStartRetries: 3,
      sleep,
    })

    expect(fetcher).toHaveBeenCalledOnce()
    expect(sleep).not.toHaveBeenCalled()
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
      emptyValue: {},
    })

    expect(value).toEqual({ a: 'x' })
    expect(ref.current).toEqual({ value: { a: 'x' }, fetchedAt: 5_000 })
  })
})
