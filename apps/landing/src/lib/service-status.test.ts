import { describe, expect, it, vi } from 'vitest'
import { parseServiceStatuses, resolveServiceStatuses } from './service-status'
import type { ServiceStatusCacheRef } from './service-status'

describe('parseServiceStatuses', () => {
  it('extracts a slug→status map from a success payload', () => {
    expect(
      parseServiceStatuses({
        status: 'success',
        data: [
          { slug: 'passport-renewal', status: 'enabled' },
          { slug: 'apply-for-conductor-licence', status: 'disabled' },
        ],
      }),
    ).toEqual({
      'passport-renewal': 'enabled',
      'apply-for-conductor-licence': 'disabled',
    })
  })

  it('returns an empty map for zero rows (a valid empty state)', () => {
    expect(parseServiceStatuses({ status: 'success', data: [] })).toEqual({})
  })

  it('ignores extra fields on an entry (e.g. id, timestamps)', () => {
    expect(
      parseServiceStatuses({
        status: 'success',
        data: [
          {
            id: 'uuid-1',
            slug: 'passport-renewal',
            status: 'form_disabled',
            createdAt: '2026-01-01',
          },
        ],
      }),
    ).toEqual({ 'passport-renewal': 'form_disabled' })
  })

  it('throws on an unexpected response envelope', () => {
    expect(() => parseServiceStatuses({ status: 'error' })).toThrow(
      /response shape/,
    )
    expect(() => parseServiceStatuses(null)).toThrow(/response shape/)
    expect(() =>
      parseServiceStatuses({ status: 'success', data: 'nope' }),
    ).toThrow(/response shape/)
  })

  it('throws on an entry with a non-string slug', () => {
    expect(() =>
      parseServiceStatuses({
        status: 'success',
        data: [{ slug: 42, status: 'enabled' }],
      }),
    ).toThrow(/slug/)
  })

  it('throws on an entry with an invalid status value', () => {
    expect(() =>
      parseServiceStatuses({
        status: 'success',
        data: [{ slug: 'passport-renewal', status: 'archived' }],
      }),
    ).toThrow(/status/)
  })
})

describe('resolveServiceStatuses', () => {
  const TTL = 60_000

  it('returns the cached map without fetching when fresh', async () => {
    const cache: ServiceStatusCacheRef = {
      current: { statuses: { a: 'enabled' }, fetchedAt: 1_000 },
    }
    const fetcher = vi.fn()

    const statuses = await resolveServiceStatuses({
      now: 1_000 + TTL - 1,
      ttlMs: TTL,
      fetcher,
      cache,
    })

    expect(statuses).toEqual({ a: 'enabled' })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('refetches and updates the cache when stale', async () => {
    const cache: ServiceStatusCacheRef = {
      current: { statuses: { a: 'enabled' }, fetchedAt: 1_000 },
    }
    const fetcher = vi.fn().mockResolvedValue({ a: 'disabled' })

    const statuses = await resolveServiceStatuses({
      now: 1_000 + TTL,
      ttlMs: TTL,
      fetcher,
      cache,
    })

    expect(statuses).toEqual({ a: 'disabled' })
    expect(fetcher).toHaveBeenCalledOnce()
    expect(cache.current).toEqual({
      statuses: { a: 'disabled' },
      fetchedAt: 1_000 + TTL,
    })
  })

  it('fetches on a cold start with no cache', async () => {
    const cache: ServiceStatusCacheRef = { current: null }
    const fetcher = vi.fn().mockResolvedValue({ a: 'enabled' })

    const statuses = await resolveServiceStatuses({
      now: 5_000,
      ttlMs: TTL,
      fetcher,
      cache,
    })

    expect(statuses).toEqual({ a: 'enabled' })
    expect(cache.current).toEqual({
      statuses: { a: 'enabled' },
      fetchedAt: 5_000,
    })
  })

  it('falls back to the last-known-good map when a refetch fails', async () => {
    const cache: ServiceStatusCacheRef = {
      current: { statuses: { a: 'enabled' }, fetchedAt: 1_000 },
    }
    const fetcher = vi.fn().mockRejectedValue(new Error('API down'))

    const statuses = await resolveServiceStatuses({
      now: 1_000 + TTL,
      ttlMs: TTL,
      fetcher,
      cache,
    })

    expect(statuses).toEqual({ a: 'enabled' })
    expect(cache.current).toEqual({
      statuses: { a: 'enabled' },
      fetchedAt: 1_000 + TTL,
    })
  })

  it('returns an empty map (and warns) on a cold start when the fetch fails', async () => {
    const cache: ServiceStatusCacheRef = { current: null }
    const fetcher = vi.fn().mockRejectedValue(new Error('API down'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const statuses = await resolveServiceStatuses({
      now: 5_000,
      ttlMs: TTL,
      fetcher,
      cache,
    })

    expect(statuses).toEqual({})
    expect(cache.current).toBeNull()
    expect(warn).toHaveBeenCalledOnce()

    warn.mockRestore()
  })

  it('retries on a cold start and succeeds once the API recovers', async () => {
    const cache: ServiceStatusCacheRef = { current: null }
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('down'))
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValue({ a: 'enabled' })
    const sleep = vi.fn(async () => {})

    const statuses = await resolveServiceStatuses({
      now: 5_000,
      ttlMs: TTL,
      fetcher,
      cache,
      coldStartRetries: 3,
      sleep,
    })

    expect(statuses).toEqual({ a: 'enabled' })
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledTimes(2)
  })

  it('gives up after exhausting cold-start retries', async () => {
    const cache: ServiceStatusCacheRef = { current: null }
    const fetcher = vi.fn().mockRejectedValue(new Error('still down'))
    const sleep = vi.fn(async () => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const statuses = await resolveServiceStatuses({
      now: 5_000,
      ttlMs: TTL,
      fetcher,
      cache,
      coldStartRetries: 2,
      sleep,
    })

    expect(statuses).toEqual({})
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(warn).toHaveBeenCalledOnce()

    warn.mockRestore()
  })

  it('does NOT retry when a stale cached map is available', async () => {
    const cache: ServiceStatusCacheRef = {
      current: { statuses: { a: 'enabled' }, fetchedAt: 1_000 },
    }
    const fetcher = vi.fn().mockRejectedValue(new Error('down'))
    const sleep = vi.fn(async () => {})

    const statuses = await resolveServiceStatuses({
      now: 1_000 + TTL,
      ttlMs: TTL,
      fetcher,
      cache,
      coldStartRetries: 3,
      sleep,
    })

    expect(statuses).toEqual({ a: 'enabled' })
    expect(fetcher).toHaveBeenCalledOnce()
    expect(sleep).not.toHaveBeenCalled()
  })
})
