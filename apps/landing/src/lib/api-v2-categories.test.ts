import { createServer } from 'node:http'
import type { IncomingHttpHeaders, Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { QueryClient } from '@tanstack/react-query'
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import {
  CATEGORY_TREE_STALE_MS,
  categoryTreeQuery,
  fetchCachedCategoryTree,
  fetchCategoryListing,
  fetchCategoryTree,
  resolveCategoryAddress,
} from './api-v2-categories'
import type { CategoryListing, CategoryNode } from './api-v2-categories'

/** The one `api_v2_fallback` line logged through `spy`, parsed. */
function logged(spy: ReturnType<typeof vi.spyOn>) {
  expect(spy).toHaveBeenCalledOnce()
  return JSON.parse(String(spy.mock.calls[0][0]))
}

const TREE: CategoryNode[] = [
  {
    slug: 'money-financial-support',
    url: '/money-financial-support',
    title: 'Money and financial support',
    description: null,
    subcategories: [
      {
        slug: 'benefits',
        url: '/money-financial-support/benefits',
        title: 'Benefits',
        description: 'Help with costs',
      },
    ],
  },
]

const LISTING: CategoryListing = {
  category: {
    slug: 'money-financial-support',
    url: '/money-financial-support',
    title: 'Money and financial support',
    description: null,
  },
  parent: null,
  subcategories: [TREE[0].subcategories[0]],
  pages: [
    {
      url: '/money-financial-support/apply-for-a-grant',
      title: 'Apply for a grant',
      description: null,
      digital: true,
    },
  ],
}

/** What the next request to the fake api_v2 answers. */
type Reply = { status: number; body: string } | 'hang'

let reply: Reply = { status: 200, body: '' }

const requests: Array<{ url: string; headers: IncomingHttpHeaders }> = []

let server: Server

let base: string

const json = (status: number, body: unknown): Reply => ({
  status,
  body: JSON.stringify(body),
})

beforeAll(async () => {
  server = createServer((request, response) => {
    requests.push({ url: request.url ?? '', headers: request.headers })

    if (reply === 'hang') return
    response.writeHead(reply.status, { 'content-type': 'application/json' })
    response.end(reply.body)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  // SAFETY: a TCP server listening on a host and port reports an AddressInfo;
  // only a pipe or unix socket reports a string, and only a closed one null.
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise((resolve) => server.close(resolve))
})

afterEach(() => {
  requests.length = 0
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('fetchCategoryTree', () => {
  it('is disabled without reading anything when api_v2 is not configured', async () => {
    expect(await fetchCategoryTree(null)).toEqual({ kind: 'disabled' })
    expect(requests).toEqual([])
  })

  it('reads the public tree, never the editor list or a preview', async () => {
    reply = json(200, { categories: TREE })
    expect(await fetchCategoryTree(base)).toEqual({
      kind: 'found',
      categories: TREE,
    })
    expect(requests.map((request) => request.url)).toEqual(['/categories'])
    expect(requests[0].headers).not.toHaveProperty('x-preview-token')
    expect(requests[0].headers).not.toHaveProperty('cookie')
  })

  it('keeps only the public fields of each category', async () => {
    reply = json(200, {
      categories: [{ ...TREE[0], id: 'c1', services: 4, updated_at: 'x' }],
    })
    expect(await fetchCategoryTree(base)).toEqual({
      kind: 'found',
      categories: TREE,
    })
  })

  it('is found and empty when nothing is public yet', async () => {
    reply = json(200, { categories: [] })
    expect(await fetchCategoryTree(base)).toEqual({
      kind: 'found',
      categories: [],
    })
  })

  it('logs a failed read as one api_v2_fallback line at error', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    reply = json(503, { error: 'internal_error' })
    await fetchCategoryTree(base)
    expect(logged(error)).toEqual({
      event: 'api_v2_fallback',
      reason: 'status',
      url: '/categories',
      status: 503,
    })
  })

  it.each([
    ['a server error', json(500, { error: 'internal_error' }), 500],
    ['a missing route', json(404, { error: 'not_found' }), 404],
  ])('is unavailable on %s, logged as status', async (_, response, status) => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    reply = response
    expect(await fetchCategoryTree(base)).toEqual({ kind: 'unavailable' })
    expect(logged(error)).toEqual({
      event: 'api_v2_fallback',
      reason: 'status',
      url: '/categories',
      status,
    })
  })

  it('is unavailable when api_v2 cannot be reached', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const closed = createServer()
    await new Promise<void>((resolve) => closed.listen(0, '127.0.0.1', resolve))
    // SAFETY: still listening on TCP here, so address() is an AddressInfo.
    const { port } = closed.address() as AddressInfo
    await new Promise((resolve) => closed.close(resolve))
    expect(await fetchCategoryTree(`http://127.0.0.1:${port}`)).toEqual({
      kind: 'unavailable',
    })
    expect(logged(error)).toMatchObject({
      event: 'api_v2_fallback',
      reason: 'network',
      url: '/categories',
      error: expect.stringContaining('ECONNREFUSED'),
    })
  })

  it('is unavailable when api_v2 does not answer in time', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    reply = 'hang'
    const result = fetchCategoryTree(base)
    await vi.waitFor(() => expect(requests).toHaveLength(1))
    await vi.runAllTimersAsync()
    expect(await result).toEqual({ kind: 'unavailable' })
    expect(logged(error)).toMatchObject({
      event: 'api_v2_fallback',
      reason: 'timeout',
      url: '/categories',
    })
  })

  it.each([
    ['not JSON', { status: 200, body: '<html>' }],
    ['the wrong shape', json(200, { categories: [{ slug: 1 }] })],
    ['a missing list', json(200, {})],
  ])('is malformed when the body is %s', async (_, response) => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    reply = response
    expect(await fetchCategoryTree(base)).toEqual({ kind: 'malformed' })
    expect(logged(error)).toEqual({
      event: 'api_v2_fallback',
      reason: 'malformed',
      url: '/categories',
    })
  })
})

describe('fetchCategoryListing', () => {
  it('is disabled without reading anything when api_v2 is not configured', async () => {
    expect(
      await fetchCategoryListing(null, ['money-financial-support']),
    ).toEqual({ kind: 'disabled' })
    expect(requests).toEqual([])
  })

  it('reads a category with both its own pages and its subcategories', async () => {
    reply = json(200, LISTING)
    expect(
      await fetchCategoryListing(base, ['money-financial-support']),
    ).toEqual({ kind: 'found', listing: LISTING })
    expect(requests.map((request) => request.url)).toEqual([
      '/categories/money-financial-support',
    ])
  })

  it('reads a subcategory at its two-segment public address', async () => {
    reply = json(200, { ...LISTING, parent: LISTING.category })
    await fetchCategoryListing(base, ['money-financial-support', 'benefits'])
    expect(requests.map((request) => request.url)).toEqual([
      '/categories/money-financial-support/benefits',
    ])
    expect(requests[0].headers).not.toHaveProperty('x-preview-token')
  })

  it.each([['..'], ['a/b'], ['Benefits'], ['x?y']])(
    'is not found without a request for the non-slug %s',
    async (segment) => {
      expect(
        await fetchCategoryListing(base, ['money-financial-support', segment]),
      ).toEqual({ kind: 'not_found' })
      expect(requests).toEqual([])
    },
  )

  it('is not found on a 404, so the caller can try a page', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    reply = json(404, { error: 'not_found' })
    expect(await fetchCategoryListing(base, ['nope'])).toEqual({
      kind: 'not_found',
    })
    expect(error).not.toHaveBeenCalled()
  })

  it('is unavailable on a server error, not not-found', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    reply = json(503, { error: 'internal_error' })
    expect(await fetchCategoryListing(base, ['money', 'tax'])).toEqual({
      kind: 'unavailable',
    })
    expect(logged(error)).toEqual({
      event: 'api_v2_fallback',
      reason: 'status',
      url: '/categories/money/tax',
      status: 503,
    })
  })

  it('is malformed when the listing has the wrong shape', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    reply = json(200, { ...LISTING, pages: 'none' })
    expect(await fetchCategoryListing(base, ['money'])).toEqual({
      kind: 'malformed',
    })
  })
})

describe('categoryTreeQuery', () => {
  const freshClient = () =>
    new QueryClient({ defaultOptions: { queries: { retry: false } } })

  it('reads the tree once per query client while it is fresh', async () => {
    reply = json(200, { categories: TREE })
    const load = () => fetchCategoryTree(base)
    const client = freshClient()
    await client.fetchQuery(categoryTreeQuery(load))
    await client.fetchQuery(categoryTreeQuery(load))
    expect(requests).toHaveLength(1)

    // Another request (or tab) has its own client, so reads its own tree.
    await freshClient().fetchQuery(categoryTreeQuery(load))
    expect(requests).toHaveLength(2)
  })

  it('rereads the tree once it is older than api_v2 keeps it fresh', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    reply = json(200, { categories: TREE })
    const load = () => fetchCategoryTree(base)
    const client = freshClient()
    await client.fetchQuery(categoryTreeQuery(load))

    vi.advanceTimersByTime(CATEGORY_TREE_STALE_MS - 1)
    await client.fetchQuery(categoryTreeQuery(load))
    expect(requests).toHaveLength(1)

    reply = json(200, { categories: [] })
    vi.advanceTimersByTime(1)
    expect(await client.fetchQuery(categoryTreeQuery(load))).toEqual({
      kind: 'found',
      categories: [],
    })
    expect(requests).toHaveLength(2)
  })

  it('holds a failed read for the same minute, then tries again', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    reply = json(500, { error: 'internal_error' })
    const load = () => fetchCategoryTree(base)
    const client = freshClient()
    expect(await client.fetchQuery(categoryTreeQuery(load))).toEqual({
      kind: 'unavailable',
    })
    await client.fetchQuery(categoryTreeQuery(load))
    expect(requests).toHaveLength(1)

    reply = json(200, { categories: TREE })
    vi.advanceTimersByTime(CATEGORY_TREE_STALE_MS)
    expect(await client.fetchQuery(categoryTreeQuery(load))).toEqual({
      kind: 'found',
      categories: TREE,
    })
  })

  it('keeps disabled for the life of the client', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    const load = vi.fn(() => fetchCategoryTree(null))
    const client = freshClient()
    await client.fetchQuery(categoryTreeQuery(load))
    await vi.advanceTimersByTimeAsync(CATEGORY_TREE_STALE_MS * 10)
    await client.fetchQuery(categoryTreeQuery(load))
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('turns a failed server-function call into unavailable, never a rejection', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const client = freshClient()
    await expect(
      client.fetchQuery(
        categoryTreeQuery(() => Promise.reject(new Error('offline'))),
      ),
    ).resolves.toEqual({ kind: 'unavailable' })
  })
})

describe('fetchCachedCategoryTree', () => {
  it('shares a public read between concurrent request clients and expires it after a minute', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    reply = json(200, { categories: TREE })
    const load = () => fetchCachedCategoryTree(`${base}/shared`)
    const first = new QueryClient()
    const second = new QueryClient()

    try {
      const results = await Promise.all([
        first.fetchQuery(categoryTreeQuery(load)),
        second.fetchQuery(categoryTreeQuery(load)),
      ])
      expect(results).toEqual([
        { kind: 'found', categories: TREE },
        { kind: 'found', categories: TREE },
      ])
      expect(requests).toHaveLength(1)
      expect(requests[0].headers).not.toHaveProperty('cookie')
      expect(requests[0].headers).not.toHaveProperty('x-preview-token')

      reply = json(200, { categories: [] })
      vi.advanceTimersByTime(CATEGORY_TREE_STALE_MS - 1)
      expect(await load()).toEqual({ kind: 'found', categories: TREE })
      expect(requests).toHaveLength(1)
      vi.advanceTimersByTime(1)
      expect(await load()).toEqual({ kind: 'found', categories: [] })
      expect(requests).toHaveLength(2)
    } finally {
      first.clear()
      second.clear()
    }
  })

  it.each([
    ['unavailable', json(503, { error: 'internal_error' })],
    ['malformed', json(200, { categories: 'broken' })],
  ] as const)(
    'caches %s across requests without preserving stale categories',
    async (kind, failure) => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const load = () => fetchCachedCategoryTree(`${base}/${kind}`)
      reply = json(200, { categories: TREE })
      expect(await load()).toEqual({ kind: 'found', categories: TREE })
      vi.advanceTimersByTime(CATEGORY_TREE_STALE_MS)
      reply = failure
      expect(await load()).toEqual({ kind })
      expect(requests).toHaveLength(2)
      reply = json(200, { categories: [] })
      expect(await load()).toEqual({ kind })
      expect(requests).toHaveLength(2)
      vi.advanceTimersByTime(CATEGORY_TREE_STALE_MS)
      expect(await load()).toEqual({ kind: 'found', categories: [] })
    },
  )

  it('a timed-out read does not make the next request wait for the API again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    reply = 'hang'
    const load = () => fetchCachedCategoryTree(`${base}/timeout`)
    const pending = load()
    await vi.waitFor(() => expect(requests).toHaveLength(1))
    await vi.advanceTimersByTimeAsync(5000)
    expect(await pending).toEqual({ kind: 'unavailable' })
    reply = json(200, { categories: TREE })
    expect(await load()).toEqual({ kind: 'unavailable' })
    expect(requests).toHaveLength(1)
  })

  it('keeps different API bases separate and disabled mode makes no request', async () => {
    reply = json(200, { categories: TREE })
    expect(await fetchCachedCategoryTree(`${base}/one`)).toEqual({
      kind: 'found',
      categories: TREE,
    })
    reply = json(200, { categories: [] })
    expect(await fetchCachedCategoryTree(`${base}/two`)).toEqual({
      kind: 'found',
      categories: [],
    })
    expect(await fetchCachedCategoryTree(null)).toEqual({ kind: 'disabled' })
    expect(requests).toHaveLength(2)
  })
})

describe('resolveCategoryAddress', () => {
  const found = { kind: 'found', categories: TREE } as const

  const read = (path: Parameters<typeof fetchCategoryListing>[1]) =>
    fetchCategoryListing(base, path)

  it('reads a category the public tree lists, with its pages and children', async () => {
    reply = json(200, LISTING)
    expect(
      await resolveCategoryAddress(['money-financial-support'], found, read),
    ).toEqual({ kind: 'listing', listing: LISTING })
  })

  it('treats an address the tree does not list as a page, without a read', async () => {
    expect(
      await resolveCategoryAddress(
        ['money-financial-support', 'apply-for-a-grant'],
        found,
        read,
      ),
    ).toEqual({ kind: 'not_category' })
    expect(await resolveCategoryAddress(['family'], found, read)).toEqual({
      kind: 'not_category',
    })
    expect(requests).toEqual([])
  })

  it('never treats a deeper address as a category', async () => {
    expect(await resolveCategoryAddress(['a', 'b', 'c'], found, read)).toEqual({
      kind: 'not_category',
    })
    expect(requests).toEqual([])
  })

  it('asks the listing itself when the tree could not be read', async () => {
    reply = json(200, LISTING)
    expect(
      await resolveCategoryAddress(
        ['money-financial-support'],
        { kind: 'unavailable' },
        read,
      ),
    ).toEqual({ kind: 'listing', listing: LISTING })
    expect(requests.map((request) => request.url)).toEqual([
      '/categories/money-financial-support',
    ])
  })

  it('lets a missing category fall through to the page', async () => {
    reply = json(404, { error: 'not_found' })
    expect(
      await resolveCategoryAddress(['gone'], { kind: 'malformed' }, read),
    ).toEqual({ kind: 'not_category' })
  })

  it.each([
    ['unavailable', json(500, { error: 'internal_error' })],
    ['malformed', json(200, { category: 'x' })],
  ] as const)(
    'reports a %s listing, never a static one',
    async (kind, response) => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      reply = response
      expect(
        await resolveCategoryAddress(['money-financial-support'], found, read),
      ).toEqual({ kind })
    },
  )
})
