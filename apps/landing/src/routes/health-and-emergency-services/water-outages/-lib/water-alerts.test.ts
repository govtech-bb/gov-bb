import { describe, expect, it, vi } from 'vitest'
import { callTokenEndpoint, postSubscribe } from './water-alerts'

function jsonFetch(ok: boolean, body: unknown = {}) {
  return vi.fn().mockResolvedValue({ ok, json: async () => body })
}

describe('postSubscribe', () => {
  it('POSTs to /water-alerts/subscribe and passes the API message through', async () => {
    const fetchImpl = jsonFetch(true, { message: 'Check your email.' })
    const result = await postSubscribe(
      { email: 'a@b.com', area: 'saint-michael' },
      { apiBase: 'https://api.example', fetchImpl },
    )

    expect(result).toEqual({ ok: true, message: 'Check your email.' })
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://api.example/water-alerts/subscribe')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(init?.body as string)).toMatchObject({
      email: 'a@b.com',
      area: 'saint-michael',
    })
  })

  it("defaults area to 'all' when omitted", async () => {
    const fetchImpl = jsonFetch(true, {})
    await postSubscribe(
      { email: 'a@b.com' },
      { apiBase: 'https://api.example', fetchImpl },
    )
    expect(JSON.parse(fetchImpl.mock.calls[0][1]?.body as string).area).toBe(
      'all',
    )
  })

  it('rejects a missing email without calling the API', async () => {
    const fetchImpl = jsonFetch(true)
    const result = await postSubscribe(
      { area: 'all' },
      { apiBase: 'https://api.example', fetchImpl },
    )
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/valid email/i)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('reports an error on a non-2xx response', async () => {
    const result = await postSubscribe(
      { email: 'a@b.com' },
      { apiBase: 'https://api.example', fetchImpl: jsonFetch(false) },
    )
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/something went wrong/i)
  })

  it('reports an error when the request throws', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network'))
    const result = await postSubscribe(
      { email: 'a@b.com' },
      { apiBase: 'https://api.example', fetchImpl },
    )
    expect(result.ok).toBe(false)
  })

  it('strips a trailing slash from the API base', async () => {
    const fetchImpl = jsonFetch(true, {})
    await postSubscribe(
      { email: 'a@b.com' },
      { apiBase: 'https://api.example/', fetchImpl },
    )
    expect(fetchImpl.mock.calls[0][0]).toBe(
      'https://api.example/water-alerts/subscribe',
    )
  })
})

describe('callTokenEndpoint', () => {
  it('calls the right endpoint and returns the outcome', async () => {
    const fetchImpl = jsonFetch(true, { result: 'done' })
    const outcome = await callTokenEndpoint('confirm', 'tok-123', {
      apiBase: 'https://api.example',
      fetchImpl,
    })
    expect(outcome).toBe('done')
    expect(fetchImpl.mock.calls[0][0]).toBe(
      'https://api.example/water-alerts/confirm/tok-123',
    )
  })

  it('url-encodes the token and hits the unsubscribe path', async () => {
    const fetchImpl = jsonFetch(true, { result: 'already' })
    await callTokenEndpoint('unsubscribe', 'a/b c', {
      apiBase: 'https://api.example',
      fetchImpl,
    })
    expect(fetchImpl.mock.calls[0][0]).toBe(
      'https://api.example/water-alerts/unsubscribe/a%2Fb%20c',
    )
  })

  it("returns 'invalid' for an empty token without calling the API", async () => {
    const fetchImpl = jsonFetch(true, { result: 'done' })
    const outcome = await callTokenEndpoint('confirm', '', {
      apiBase: 'https://api.example',
      fetchImpl,
    })
    expect(outcome).toBe('invalid')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("returns 'invalid' on a non-2xx response", async () => {
    const outcome = await callTokenEndpoint('confirm', 'x', {
      apiBase: 'https://api.example',
      fetchImpl: jsonFetch(false),
    })
    expect(outcome).toBe('invalid')
  })

  it("returns 'invalid' when the request throws", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network'))
    const outcome = await callTokenEndpoint('confirm', 'x', {
      apiBase: 'https://api.example',
      fetchImpl,
    })
    expect(outcome).toBe('invalid')
  })
})
