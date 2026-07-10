import { describe, expect, it, vi } from 'vitest'
import { postFeedback } from './send-feedback'

const VALID = {
  visitReason: 'Renew my passport',
  whatWentWrong: 'The button did nothing',
  referrer: '/feedback',
}

function okFetch() {
  return vi.fn().mockResolvedValue({ ok: true })
}

describe('postFeedback', () => {
  it('returns a field error and never calls the API when both fields are blank', async () => {
    const fetchImpl = okFetch()
    const result = await postFeedback(
      { visitReason: '  ', whatWentWrong: '' },
      { apiBase: 'https://api.example', fetchImpl },
    )

    expect(result.fieldErrors?.visitReason).toBe(
      'At least one feedback field is required',
    )
    expect(result.success).toBeUndefined()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('POSTs valid feedback to /feedback and reports success', async () => {
    const fetchImpl = okFetch()
    const result = await postFeedback(VALID, {
      apiBase: 'https://api.example',
      fetchImpl,
    })

    expect(result).toEqual({ error: null, success: true })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://api.example/feedback')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(init?.body as string)).toMatchObject({
      visitReason: 'Renew my passport',
      whatWentWrong: 'The button did nothing',
      referrer: '/feedback',
    })
  })

  it('strips a trailing slash from the API base', async () => {
    const fetchImpl = okFetch()
    await postFeedback(VALID, {
      apiBase: 'https://api.example/',
      fetchImpl,
    })
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.example/feedback')
  })

  it('returns a server error (no false success) on a non-2xx response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false })
    const result = await postFeedback(VALID, {
      apiBase: 'https://api.example',
      fetchImpl,
    })

    expect(result.success).toBeUndefined()
    expect(result.error).toBeTruthy()
    expect(result.fieldErrors).toBeUndefined()
  })

  it('returns a server error when the request throws', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'))
    const result = await postFeedback(VALID, {
      apiBase: 'https://api.example',
      fetchImpl,
    })

    expect(result.success).toBeUndefined()
    expect(result.error).toBeTruthy()
  })
})
