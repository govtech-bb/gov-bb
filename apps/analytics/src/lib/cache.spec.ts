import { afterEach, describe, expect, it, vi } from 'vitest'
import { memoize, __clearCache } from './cache'

afterEach(() => {
  __clearCache()
  vi.useRealTimers()
})

describe('memoize', () => {
  it('returns the cached value within the ttl, refetches after it expires', async () => {
    vi.useFakeTimers()
    let calls = 0
    const fn = async () => ++calls
    expect(await memoize('k', 1000, fn)).toBe(1)
    expect(await memoize('k', 1000, fn)).toBe(1)
    vi.advanceTimersByTime(1001)
    expect(await memoize('k', 1000, fn)).toBe(2)
  })

  it('does not cache a rejected call', async () => {
    let calls = 0
    const fn = async () => {
      calls++
      throw new Error('boom')
    }
    await expect(memoize('k', 1000, fn)).rejects.toThrow('boom')
    await expect(memoize('k', 1000, fn)).rejects.toThrow('boom')
    expect(calls).toBe(2)
  })
})
