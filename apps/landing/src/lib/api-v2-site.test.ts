import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchApiV2Catalog,
  fetchApiV2SearchDocuments,
  loadApiV2SearchDocuments,
} from './api-v2-site'
import type { ApiV2SearchDocument } from './api-v2-site'

const DOCUMENT: ApiV2SearchDocument = {
  url: '/work-employment/apply-for-a-grant',
  title: 'Apply for a grant',
  description: null,
  digital: true,
  keywords: ['funding'],
  chunks: [{ heading: null, body: 'Some money.' }],
}

const serverFn = vi.hoisted(() => vi.fn())

// Every server function in the import graph is `serverFn`; only the
// search documents one is called here.
vi.mock('@tanstack/react-start', () => {
  const builder = { validator: () => builder, handler: () => serverFn }
  return { createServerFn: () => builder }
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status })

/** Each test gets its own base, so the module cache never carries over. */
let bases = 0
const nextBase = () => `http://api-v2-${++bases}.test`

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('fetchApiV2Catalog', () => {
  it('lists the catalog urls', async () => {
    const fetchImpl = vi.fn(async () =>
      json({ pages: [{ url: '/a', title: 'A', stage: null }] }),
    )
    const base = nextBase()
    expect(await fetchApiV2Catalog(base, fetchImpl)).toEqual(['/a'])
    expect(fetchImpl).toHaveBeenCalledWith(`${base}/catalog`, expect.anything())
  })

  it('is empty without reading anything when api_v2 is not configured', async () => {
    const fetchImpl = vi.fn()
    expect(await fetchApiV2Catalog(null, fetchImpl)).toEqual([])
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('fetchApiV2SearchDocuments', () => {
  it('parses the search documents', async () => {
    const fetchImpl = vi.fn(async () => json({ documents: [DOCUMENT] }))
    expect(await fetchApiV2SearchDocuments(nextBase(), fetchImpl)).toEqual([
      DOCUMENT,
    ])
  })

  it.each([
    ['a 500', async () => json({}, 500)],
    [
      'a network error',
      async () => {
        throw new Error('down')
      },
    ],
    ['a malformed body', async () => json({ documents: [{ url: 1 }] })],
  ])('is empty after %s on a cold cache', async (_, reply) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await fetchApiV2SearchDocuments(nextBase(), vi.fn(reply))).toEqual(
      [],
    )
  })

  it('reads again only once a minute has passed', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const fetchImpl = vi.fn(async () => json({ documents: [DOCUMENT] }))
    const base = nextBase()

    await fetchApiV2SearchDocuments(base, fetchImpl)
    vi.advanceTimersByTime(59_000)
    await fetchApiV2SearchDocuments(base, fetchImpl)
    expect(fetchImpl).toHaveBeenCalledOnce()

    vi.advanceTimersByTime(2_000)
    await fetchApiV2SearchDocuments(base, fetchImpl)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('serves the last good documents when a later read fails', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const base = nextBase()

    await fetchApiV2SearchDocuments(
      base,
      vi.fn(async () => json({ documents: [DOCUMENT] })),
    )
    vi.advanceTimersByTime(61_000)
    const failing = vi.fn(async () => json({}, 503))
    expect(await fetchApiV2SearchDocuments(base, failing)).toEqual([DOCUMENT])
    expect(failing).toHaveBeenCalledOnce()
  })
})

describe('loadApiV2SearchDocuments', () => {
  it('shares one read a minute, without one when api_v2 is unset', async () => {
    vi.stubEnv('VITE_API_V2_URL', '')
    expect(await loadApiV2SearchDocuments(0)).toEqual([])
    expect(serverFn).not.toHaveBeenCalled()

    vi.stubEnv('VITE_API_V2_URL', 'http://api.example')
    serverFn.mockResolvedValue([DOCUMENT])
    const first = await loadApiV2SearchDocuments(0)
    expect(first).toEqual([DOCUMENT])
    expect(await loadApiV2SearchDocuments(59_999)).toBe(first)
    expect(serverFn).toHaveBeenCalledTimes(1)

    await loadApiV2SearchDocuments(60_000)
    expect(serverFn).toHaveBeenCalledTimes(2)
    vi.unstubAllEnvs()
  })

  it('is empty when the server function fails', async () => {
    vi.stubEnv('VITE_API_V2_URL', 'http://api.example')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    serverFn.mockRejectedValue(new Error('down'))
    expect(await loadApiV2SearchDocuments(10 * 60_000)).toEqual([])
    vi.unstubAllEnvs()
  })
})
