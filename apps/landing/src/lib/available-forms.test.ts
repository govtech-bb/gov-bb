import { describe, expect, it, vi } from 'vitest'
import {
  parseFormIds,
  parseMaintenanceIds,
  resolveAvailableForms,
  type CacheRef,
} from './available-forms'

describe('parseFormIds', () => {
  it('extracts form IDs from a success payload', () => {
    expect(
      parseFormIds({
        status: 'success',
        data: [{ formId: 'get-birth-certificate' }, { formId: 'pay-taxes' }],
      }),
    ).toEqual(['get-birth-certificate', 'pay-taxes'])
  })

  it('returns an empty list for zero forms (a valid empty state)', () => {
    expect(parseFormIds({ status: 'success', data: [] })).toEqual([])
  })

  it('throws on an unexpected response shape', () => {
    expect(() => parseFormIds({ status: 'error' })).toThrow(/response shape/)
    expect(() => parseFormIds(null)).toThrow(/response shape/)
    expect(() => parseFormIds({ status: 'success', data: 'nope' })).toThrow(
      /response shape/,
    )
  })

  it('throws on a form ID that is not kebab-case', () => {
    expect(() =>
      parseFormIds({ status: 'success', data: [{ formId: 'Bad_Id' }] }),
    ).toThrow(/failed validation/)
  })
})

describe('parseMaintenanceIds', () => {
  it('extracts the bare-string ID list from a success payload', () => {
    expect(
      parseMaintenanceIds({
        status: 'success',
        data: [
          'post-office-redirection-individual',
          'apply-for-conductor-licence',
        ],
      }),
    ).toEqual([
      'post-office-redirection-individual',
      'apply-for-conductor-licence',
    ])
  })

  it('returns an empty list when nothing is under maintenance', () => {
    expect(parseMaintenanceIds({ status: 'success', data: [] })).toEqual([])
  })

  it('throws on an unexpected response shape', () => {
    expect(() => parseMaintenanceIds({ status: 'error' })).toThrow(
      /response shape/,
    )
    expect(() => parseMaintenanceIds(null)).toThrow(/response shape/)
  })

  it('throws on a form ID that is not kebab-case', () => {
    expect(() =>
      parseMaintenanceIds({ status: 'success', data: ['Bad_Id'] }),
    ).toThrow(/failed validation/)
  })
})

describe('resolveAvailableForms', () => {
  const TTL = 60_000

  it('returns the cached list without fetching when fresh', async () => {
    const cache: CacheRef = { current: { ids: ['a'], fetchedAt: 1_000 } }
    const fetcher = vi.fn()

    const ids = await resolveAvailableForms({
      now: 1_000 + TTL - 1,
      ttlMs: TTL,
      fetcher,
      cache,
    })

    expect(ids).toEqual(['a'])
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('refetches and updates the cache when stale', async () => {
    const cache: CacheRef = { current: { ids: ['old'], fetchedAt: 1_000 } }
    const fetcher = vi.fn().mockResolvedValue(['new'])

    const ids = await resolveAvailableForms({
      now: 1_000 + TTL,
      ttlMs: TTL,
      fetcher,
      cache,
    })

    expect(ids).toEqual(['new'])
    expect(fetcher).toHaveBeenCalledOnce()
    expect(cache.current).toEqual({ ids: ['new'], fetchedAt: 1_000 + TTL })
  })

  it('fetches on a cold start with no cache', async () => {
    const cache: CacheRef = { current: null }
    const fetcher = vi.fn().mockResolvedValue(['first'])

    const ids = await resolveAvailableForms({
      now: 5_000,
      ttlMs: TTL,
      fetcher,
      cache,
    })

    expect(ids).toEqual(['first'])
    expect(cache.current).toEqual({ ids: ['first'], fetchedAt: 5_000 })
  })

  it('falls back to the last-known-good list when a refetch fails', async () => {
    const cache: CacheRef = { current: { ids: ['good'], fetchedAt: 1_000 } }
    const fetcher = vi.fn().mockRejectedValue(new Error('API down'))

    const ids = await resolveAvailableForms({
      now: 1_000 + TTL,
      ttlMs: TTL,
      fetcher,
      cache,
    })

    expect(ids).toEqual(['good'])
    // The fallback list is preserved, but the attempt is re-stamped so a down
    // API gets a fresh `ttlMs` cooldown instead of being re-fetched (and blocked
    // on the full timeout) by every subsequent request.
    expect(cache.current).toEqual({ ids: ['good'], fetchedAt: 1_000 + TTL })
  })

  it('returns an empty list (and warns) on a cold start when the fetch fails', async () => {
    const cache: CacheRef = { current: null }
    const fetcher = vi.fn().mockRejectedValue(new Error('API down'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const ids = await resolveAvailableForms({
      now: 5_000,
      ttlMs: TTL,
      fetcher,
      cache,
    })

    expect(ids).toEqual([])
    expect(cache.current).toBeNull()
    expect(warn).toHaveBeenCalledOnce()

    warn.mockRestore()
  })

  it('retries on a cold start and succeeds once the API recovers', async () => {
    const cache: CacheRef = { current: null }
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('down'))
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValue(['recovered'])
    const sleep = vi.fn(async () => {})

    const ids = await resolveAvailableForms({
      now: 5_000,
      ttlMs: TTL,
      fetcher,
      cache,
      coldStartRetries: 3,
      sleep,
    })

    expect(ids).toEqual(['recovered'])
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledTimes(2)
    expect(cache.current).toEqual({ ids: ['recovered'], fetchedAt: 5_000 })
  })

  it('gives up after exhausting cold-start retries', async () => {
    const cache: CacheRef = { current: null }
    const fetcher = vi.fn().mockRejectedValue(new Error('still down'))
    const sleep = vi.fn(async () => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const ids = await resolveAvailableForms({
      now: 5_000,
      ttlMs: TTL,
      fetcher,
      cache,
      coldStartRetries: 2,
      sleep,
    })

    expect(ids).toEqual([])
    // Initial attempt plus the two retries.
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(warn).toHaveBeenCalledOnce()

    warn.mockRestore()
  })

  it('does NOT retry when a stale cached list is available', async () => {
    const cache: CacheRef = { current: { ids: ['good'], fetchedAt: 1_000 } }
    const fetcher = vi.fn().mockRejectedValue(new Error('down'))
    const sleep = vi.fn(async () => {})

    const ids = await resolveAvailableForms({
      now: 1_000 + TTL,
      ttlMs: TTL,
      fetcher,
      cache,
      coldStartRetries: 3,
      sleep,
    })

    expect(ids).toEqual(['good'])
    expect(fetcher).toHaveBeenCalledOnce()
    expect(sleep).not.toHaveBeenCalled()
  })
})
