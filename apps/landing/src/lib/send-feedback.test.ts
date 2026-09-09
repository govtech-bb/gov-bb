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

  it('forwards a valid email address in the body', async () => {
    const fetchImpl = okFetch()
    const result = await postFeedback(
      { ...VALID, email: '  visitor@example.com  ' },
      { apiBase: 'https://api.example', fetchImpl },
    )

    expect(result).toEqual({ error: null, success: true })
    const body = JSON.parse(fetchImpl.mock.calls[0][1]?.body as string)
    // Trimmed before forwarding.
    expect(body.email).toBe('visitor@example.com')
  })

  it('succeeds with a blank email and never forwards the email key', async () => {
    const fetchImpl = okFetch()
    const result = await postFeedback(
      { ...VALID, email: '   ' },
      { apiBase: 'https://api.example', fetchImpl },
    )

    expect(result).toEqual({ error: null, success: true })
    const body = JSON.parse(fetchImpl.mock.calls[0][1]?.body as string)
    // An all-whitespace value is treated as absent — the API rejects "".
    expect('email' in body).toBe(false)
  })

  it('returns a field error and never calls the API for a malformed email', async () => {
    const fetchImpl = okFetch()
    const result = await postFeedback(
      { ...VALID, email: 'not-an-email' },
      { apiBase: 'https://api.example', fetchImpl },
    )

    expect(result.fieldErrors?.email).toBe(
      'Enter an email address in the correct format, like name@example.com',
    )
    expect(result.success).toBeUndefined()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('still rejects an email on its own when both feedback fields are blank', async () => {
    const fetchImpl = okFetch()
    const result = await postFeedback(
      { visitReason: '', whatWentWrong: '', email: 'visitor@example.com' },
      { apiBase: 'https://api.example', fetchImpl },
    )

    expect(result.fieldErrors?.visitReason).toBe(
      'At least one feedback field is required',
    )
    expect(result.success).toBeUndefined()
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
