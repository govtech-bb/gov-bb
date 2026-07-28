import { describe, expect, it, vi } from 'vitest'
import {
  deriveFormDisabledSlugs,
  deriveVisibilityOverlay,
  parseServiceStatuses,
  resolveServiceStatuses,
} from './service-status'
import type { CacheRef } from './service-status'

describe('parseServiceStatuses', () => {
  it('extracts slug/status entries from a success payload', () => {
    expect(
      parseServiceStatuses({
        status: 'success',
        data: [
          { slug: 'apply-financial-assistance', status: 'disabled' },
          {
            slug: 'money-financial-support/pay-taxes',
            status: 'form_disabled',
          },
        ],
      }),
    ).toEqual([
      ['apply-financial-assistance', 'disabled'],
      ['money-financial-support/pay-taxes', 'form_disabled'],
    ])
  })

  it('returns an empty list when no service has a status row', () => {
    expect(parseServiceStatuses({ status: 'success', data: [] })).toEqual([])
  })

  it('throws on an unexpected response shape', () => {
    expect(() => parseServiceStatuses({ status: 'error' })).toThrow(
      /response shape/,
    )
    expect(() => parseServiceStatuses(null)).toThrow(/response shape/)
    expect(() =>
      parseServiceStatuses({ status: 'success', data: 'nope' }),
    ).toThrow(/response shape/)
  })

  it('throws on an unknown status value', () => {
    expect(() =>
      parseServiceStatuses({
        status: 'success',
        data: [{ slug: 'a', status: 'maintenance' }],
      }),
    ).toThrow(/failed validation/)
  })

  it('throws on a slug that is not a non-empty string', () => {
    expect(() =>
      parseServiceStatuses({
        status: 'success',
        data: [{ slug: '', status: 'enabled' }],
      }),
    ).toThrow(/failed validation/)
    expect(() =>
      parseServiceStatuses({
        status: 'success',
        data: [{ slug: 42, status: 'enabled' }],
      }),
    ).toThrow(/failed validation/)
  })
})

describe('deriveVisibilityOverlay', () => {
  it('maps disabled → preview so the public is gated but a token unlocks it', () => {
    const overlay = deriveVisibilityOverlay([['a', 'disabled']])
    expect(overlay.get('a')).toBe('preview')
  })

  it('maps enabled → public so a row overrides a non-public frontmatter default', () => {
    const overlay = deriveVisibilityOverlay([['a', 'enabled']])
    expect(overlay.get('a')).toBe('public')
  })

  it('omits form_disabled — it is a form-reachability concern, not visibility', () => {
    const overlay = deriveVisibilityOverlay([['a', 'form_disabled']])
    expect(overlay.has('a')).toBe(false)
  })
})

describe('deriveFormDisabledSlugs', () => {
  it('collects only the slugs whose form is disabled', () => {
    const slugs = deriveFormDisabledSlugs([
      ['a', 'form_disabled'],
      ['b', 'disabled'],
      ['c', 'enabled'],
      ['d', 'form_disabled'],
    ])
    expect(slugs).toEqual(new Set(['a', 'd']))
  })
})

describe('resolveServiceStatuses', () => {
  const TTL = 60_000

  it('returns the cached entries without fetching when fresh', async () => {
    const cache: CacheRef = {
      current: { entries: [['a', 'disabled']], fetchedAt: 1_000 },
    }
    const fetcher = vi.fn()

    const entries = await resolveServiceStatuses({
      now: 1_000 + TTL - 1,
      ttlMs: TTL,
      fetcher,
      cache,
    })

    expect(entries).toEqual([['a', 'disabled']])
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('refetches and updates the cache when stale', async () => {
    const cache: CacheRef = {
      current: { entries: [['a', 'enabled']], fetchedAt: 1_000 },
    }
    const fetcher = vi.fn().mockResolvedValue([['a', 'disabled']])

    const entries = await resolveServiceStatuses({
      now: 1_000 + TTL,
      ttlMs: TTL,
      fetcher,
      cache,
    })

    expect(entries).toEqual([['a', 'disabled']])
    expect(fetcher).toHaveBeenCalledOnce()
    expect(cache.current).toEqual({
      entries: [['a', 'disabled']],
      fetchedAt: 1_000 + TTL,
    })
  })

  it('falls back to the last-known-good entries when a refetch fails', async () => {
    const cache: CacheRef = {
      current: { entries: [['a', 'disabled']], fetchedAt: 1_000 },
    }
    const fetcher = vi.fn().mockRejectedValue(new Error('API down'))

    const entries = await resolveServiceStatuses({
      now: 1_000 + TTL,
      ttlMs: TTL,
      fetcher,
      cache,
    })

    expect(entries).toEqual([['a', 'disabled']])
    expect(cache.current).toEqual({
      entries: [['a', 'disabled']],
      fetchedAt: 1_000 + TTL,
    })
  })

  it('returns an empty list (and warns) on a cold start when the fetch fails', async () => {
    const cache: CacheRef = { current: null }
    const fetcher = vi.fn().mockRejectedValue(new Error('API down'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const entries = await resolveServiceStatuses({
      now: 5_000,
      ttlMs: TTL,
      fetcher,
      cache,
    })

    expect(entries).toEqual([])
    expect(cache.current).toBeNull()
    expect(warn).toHaveBeenCalledOnce()

    warn.mockRestore()
  })

  it('retries on a cold start and succeeds once the API recovers', async () => {
    const cache: CacheRef = { current: null }
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValue([['a', 'enabled']])
    const sleep = vi.fn(async () => {})

    const entries = await resolveServiceStatuses({
      now: 5_000,
      ttlMs: TTL,
      fetcher,
      cache,
      coldStartRetries: 3,
      sleep,
    })

    expect(entries).toEqual([['a', 'enabled']])
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledOnce()
  })

  it('does NOT retry when a stale cached list is available', async () => {
    const cache: CacheRef = {
      current: { entries: [['a', 'enabled']], fetchedAt: 1_000 },
    }
    const fetcher = vi.fn().mockRejectedValue(new Error('down'))
    const sleep = vi.fn(async () => {})

    const entries = await resolveServiceStatuses({
      now: 1_000 + TTL,
      ttlMs: TTL,
      fetcher,
      cache,
      coldStartRetries: 3,
      sleep,
    })

    expect(entries).toEqual([['a', 'enabled']])
    expect(fetcher).toHaveBeenCalledOnce()
    expect(sleep).not.toHaveBeenCalled()
  })
})
