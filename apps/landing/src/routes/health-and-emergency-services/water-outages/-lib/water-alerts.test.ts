import { describe, expect, it, vi } from 'vitest'
import {
  callTokenEndpoint,
  fetchWaterOutages,
  postSubscribe,
} from './water-alerts'

function jsonFetch(
  ok: boolean,
  body: unknown = { message: 'Check your email.' },
) {
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
    const fetchImpl = jsonFetch(true)
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
    const fetchImpl = jsonFetch(true)
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

  it("returns 'unavailable' on a non-2xx response", async () => {
    const outcome = await callTokenEndpoint('confirm', 'x', {
      apiBase: 'https://api.example',
      fetchImpl: jsonFetch(false),
    })
    expect(outcome).toBe('unavailable')
  })

  it("returns 'unavailable' when the request throws", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network'))
    const outcome = await callTokenEndpoint('confirm', 'x', {
      apiBase: 'https://api.example',
      fetchImpl,
    })
    expect(outcome).toBe('unavailable')
  })
})

describe('water alerts boundaries', () => {
  it('validates email and area before forwarding a subscription', async () => {
    const fetchImpl = jsonFetch(true)
    for (const data of [
      { email: 'invalid', area: 'all' },
      { email: 'a@b.com', area: 'not-a-parish' },
      { email: 'x'.repeat(250) + '@b.com' },
    ]) {
      expect(
        (
          await postSubscribe(data, {
            apiBase: 'https://api.example',
            fetchImpl,
          })
        ).ok,
      ).toBe(false)
    }
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('distinguishes an invalid token from an unexpected server response', async () => {
    for (const [body, expected] of [
      [{ result: 'invalid' }, 'invalid'],
      [{ result: 'unexpected' }, 'unavailable'],
      [{}, 'unavailable'],
    ] as const) {
      expect(
        await callTokenEndpoint('unsubscribe', 'token', {
          apiBase: 'https://api.example',
          fetchImpl: jsonFetch(true, body),
        }),
      ).toBe(expected)
    }
  })

  it('fails closed on an invalid or unavailable notice feed', async () => {
    for (const fetchImpl of [
      jsonFetch(false),
      jsonFetch(true, {}),
      jsonFetch(true, {
        outages: [{ id: 'bad', link: 'javascript:alert(1)' }],
        checkedAt: '2026-09-09T12:00:00.000Z',
      }),
    ]) {
      expect(
        await fetchWaterOutages('https://api.example', fetchImpl),
      ).toMatchObject({
        failed: true,
        outages: [],
        checkedAt: null,
      })
    }
  })

  it('preserves the actual feed timestamp and allows a valid empty feed', async () => {
    const checkedAt = '2026-09-09T12:00:00.000Z'
    const fetchImpl = jsonFetch(true, { outages: [], checkedAt })
    expect(
      await fetchWaterOutages('https://api.example/', fetchImpl),
    ).toMatchObject({
      failed: false,
      outages: [],
      checkedAt,
    })
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example/water-alerts/outages',
      {
        signal: expect.any(AbortSignal),
      },
    )
  })
})
