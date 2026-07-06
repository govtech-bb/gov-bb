import { describe, expect, it, vi } from 'vitest'
import { resolveFormAccessible } from './preview-form-access'

describe('resolveFormAccessible', () => {
  it('fails closed (no fetch) when no preview secret is configured', async () => {
    const fetchStatus = vi.fn()
    expect(
      await resolveFormAccessible({
        formId: 'flagged-form',
        previewSecret: undefined,
        fetchStatus,
      }),
    ).toBe(false)
    expect(fetchStatus).not.toHaveBeenCalled()
  })

  it('is accessible when the tokened GET returns 200', async () => {
    const fetchStatus = vi.fn().mockResolvedValue(200)
    expect(
      await resolveFormAccessible({
        formId: 'flagged-form',
        previewSecret: 's3cret',
        fetchStatus,
      }),
    ).toBe(true)
    expect(fetchStatus).toHaveBeenCalledWith('flagged-form', 's3cret')
  })

  it('is not accessible on a 404, or when the API errors (status 0)', async () => {
    expect(
      await resolveFormAccessible({
        formId: 'flagged-form',
        previewSecret: 's3cret',
        fetchStatus: vi.fn().mockResolvedValue(404),
      }),
    ).toBe(false)
    expect(
      await resolveFormAccessible({
        formId: 'flagged-form',
        previewSecret: 's3cret',
        fetchStatus: vi.fn().mockResolvedValue(0),
      }),
    ).toBe(false)
  })
})
