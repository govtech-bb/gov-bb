import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { fetchApiV2Catalog, readApiV2SearchDocuments } from './api-v2-site'
import type { ApiV2SearchDocument } from './api-v2-site'
import type * as SiteModule from './api-v2-site'

const DOCUMENT: ApiV2SearchDocument = {
  url: '/work-employment/apply-for-a-grant',
  title: 'Apply for a grant',
  description: null,
  digital: true,
  keywords: ['funding'],
  chunks: [{ heading: null, body: 'Some money.' }],
}

/** What the fake api_v2 answers next. */
let reply = { status: 200, body: '' }

const requests: string[] = []

let server: Server

let origin: string

const json = (status: number, body: unknown) => ({
  status,
  body: JSON.stringify(body),
})

/** Each test gets its own base, so the server cache never carries over. */
let bases = 0
const nextBase = () => `${origin}/${++bases}`

beforeAll(async () => {
  server = createServer((request, response) => {
    requests.push(request.url ?? '')
    response.writeHead(reply.status, { 'content-type': 'application/json' })
    response.end(reply.body)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  // SAFETY: a TCP server listening on a host and port reports an AddressInfo.
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise((resolve) => server.close(resolve))
})

afterEach(() => {
  requests.length = 0
  vi.restoreAllMocks()
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('fetchApiV2Catalog', () => {
  it('lists the catalog urls', async () => {
    reply = json(200, { pages: [{ url: '/a', title: 'A', stage: null }] })
    expect(await fetchApiV2Catalog(`${origin}/catalog-test`)).toEqual(['/a'])
    expect(requests).toEqual(['/catalog-test/catalog'])
  })

  it('is empty without reading anything when api_v2 is not configured', async () => {
    expect(await fetchApiV2Catalog(null)).toEqual([])
    expect(requests).toEqual([])
  })
})

describe('readApiV2SearchDocuments', () => {
  it('parses the search documents, fresh for a minute', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    reply = json(200, { documents: [DOCUMENT] })
    expect(await readApiV2SearchDocuments(nextBase())).toEqual({
      documents: [DOCUMENT],
      freshForMs: 60_000,
    })
  })

  it.each([
    ['a 500', json(500, {})],
    ['a malformed body', json(200, { documents: [{ url: 1 }] })],
  ])('is empty after %s on a cold cache', async (_, response) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    reply = response
    expect((await readApiV2SearchDocuments(nextBase())).documents).toEqual([])
  })

  it('is empty after a network error on a cold cache', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchImpl = vi.fn(async () => {
      throw new Error('down')
    })
    expect(
      (await readApiV2SearchDocuments(nextBase(), fetchImpl)).documents,
    ).toEqual([])
  })

  it('reads again only once a minute has passed', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    reply = json(200, { documents: [DOCUMENT] })
    const base = nextBase()

    await readApiV2SearchDocuments(base)
    vi.advanceTimersByTime(59_000)
    expect(await readApiV2SearchDocuments(base)).toEqual({
      documents: [DOCUMENT],
      freshForMs: 1_000,
    })
    expect(requests).toHaveLength(1)

    vi.advanceTimersByTime(2_000)
    await readApiV2SearchDocuments(base)
    expect(requests).toHaveLength(2)
  })

  it('serves the last good documents when a later read fails', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const base = nextBase()

    reply = json(200, { documents: [DOCUMENT] })
    await readApiV2SearchDocuments(base)
    vi.advanceTimersByTime(61_000)
    reply = json(503, {})
    expect((await readApiV2SearchDocuments(base)).documents).toEqual([DOCUMENT])
    expect(requests).toHaveLength(2)
  })
})

describe('loadApiV2SearchDocuments', () => {
  /** A fresh module per test: its browser memo is module state. */
  let site: typeof SiteModule

  // Vitest runs as the server; these read as the browser unless a test says.
  beforeEach(async () => {
    vi.resetModules()
    site = await import('./api-v2-site')
    vi.stubEnv('SSR', false)
    vi.stubEnv('VITE_API_V2_URL', 'http://api.example')
    vi.useFakeTimers({ toFake: ['Date'] })
  })

  /** The server function's handler against the fake api_v2, as the browser calls it. */
  const read = () => site.readApiV2SearchDocuments(origin)

  it('is empty without a read when api_v2 is unset', async () => {
    vi.stubEnv('VITE_API_V2_URL', '')
    const unread = vi.fn(read)
    expect(await site.loadApiV2SearchDocuments(unread)).toEqual([])
    expect(unread).not.toHaveBeenCalled()
  })

  it('serves api_v2 documents, sharing one read while they are fresh', async () => {
    reply = json(200, { documents: [DOCUMENT] })
    const first = await site.loadApiV2SearchDocuments(read)
    expect(first).toEqual([DOCUMENT])

    vi.advanceTimersByTime(59_999)
    expect(await site.loadApiV2SearchDocuments(read)).toBe(first)
    expect(requests).toHaveLength(1)

    reply = json(200, { documents: [] })
    vi.advanceTimersByTime(1)
    expect(await site.loadApiV2SearchDocuments(read)).toEqual([])
    expect(requests).toHaveLength(2)
  })

  it('reads again when the server copy expires, not a minute after the browser asked', async () => {
    reply = json(200, { documents: [DOCUMENT] })
    await read()

    vi.advanceTimersByTime(59_000)
    expect(await site.loadApiV2SearchDocuments(read)).toEqual([DOCUMENT])
    expect(requests).toHaveLength(1)

    reply = json(200, { documents: [] })
    vi.advanceTimersByTime(999)
    expect(await site.loadApiV2SearchDocuments(read)).toEqual([DOCUMENT])
    vi.advanceTimersByTime(1)
    expect(await site.loadApiV2SearchDocuments(read)).toEqual([])
    expect(requests).toHaveLength(2)
  })

  it('recovers from a failed first read once it expires', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    reply = json(503, {})
    expect(await site.loadApiV2SearchDocuments(read)).toEqual([])

    reply = json(200, { documents: [DOCUMENT] })
    expect(await site.loadApiV2SearchDocuments(read)).toEqual([])
    vi.advanceTimersByTime(60_000)
    expect(await site.loadApiV2SearchDocuments(read)).toEqual([DOCUMENT])
  })

  it('is empty when the server function fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(
      await site.loadApiV2SearchDocuments(() =>
        Promise.reject(new Error('down')),
      ),
    ).toEqual([])
  })

  it('reads every time on the server, behind its own cache', async () => {
    vi.stubEnv('SSR', true)
    reply = json(200, { documents: [DOCUMENT] })
    const counted = vi.fn(read)
    expect(await site.loadApiV2SearchDocuments(counted)).toEqual([DOCUMENT])
    expect(await site.loadApiV2SearchDocuments(counted)).toEqual([DOCUMENT])
    expect(counted).toHaveBeenCalledTimes(2)
    expect(requests).toHaveLength(1)
  })
})
