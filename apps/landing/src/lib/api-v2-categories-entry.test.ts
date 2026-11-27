import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The category reads behind `getApiV2CategoryTree` and
 * `getApiV2CategoryListing` (#3940), with the visitor's grant cookie, against
 * a recording api_v2 behind the global `fetch`. A server function only runs
 * inside Start's request runtime, so its handler is called directly.
 */

vi.mock('nitro/runtime-config', () => ({
  useRuntimeConfig: () => ({
    apiV2Url: 'http://api.example',
    previewSecret: 'secret',
  }),
}))

let cookie: string | undefined
vi.mock('@tanstack/react-start/server', () => ({ getCookie: () => cookie }))

let fetchImpl: ReturnType<typeof vi.fn<typeof fetch>>

/** The `x-preview-token` each category read carried, in order. */
const previewTokens = () =>
  fetchImpl.mock.calls
    .filter(([url]) => String(url).includes('/categories'))
    .map(([, init]) => new Headers(init?.headers).get('x-preview-token'))

beforeEach(() => {
  // A fresh module per test: a fresh public tree cache and breaker.
  vi.resetModules()
  cookie = undefined
  fetchImpl = vi.fn<typeof fetch>(async (url) => {
    const path = String(url)
    if (path.endsWith('/site-version')) return Response.json({ version: 'v1' })
    if (path.endsWith('/categories')) return Response.json({ categories: [] })
    return Response.json({ error: 'not_found' }, { status: 404 })
  })
  vi.stubGlobal('fetch', fetchImpl)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('readApiV2CategoryTree', () => {
  it('reads the public tree without a preview token', async () => {
    const { readApiV2CategoryTree } = await import('./api-v2-categories')
    expect(await readApiV2CategoryTree()).toEqual({
      kind: 'found',
      categories: [],
    })
    expect(previewTokens()).toEqual([null])
  })

  it("reads a reviewer's tree with the preview token, every time", async () => {
    cookie = 'preview'
    const { readApiV2CategoryTree } = await import('./api-v2-categories')
    await readApiV2CategoryTree()
    await readApiV2CategoryTree()
    // Never from the shared public cache: each read asks api_v2 again.
    expect(previewTokens()).toEqual(['secret', 'secret'])
  })

  it("never serves a reviewer's tree to the public", async () => {
    cookie = 'preview'
    const { readApiV2CategoryTree } = await import('./api-v2-categories')
    await readApiV2CategoryTree()
    cookie = undefined
    await readApiV2CategoryTree()
    expect(previewTokens()).toEqual(['secret', null])
  })
})

describe('readApiV2CategoryListing', () => {
  it('reads a public listing without a preview token', async () => {
    const { readApiV2CategoryListing } = await import('./api-v2-categories')
    expect(await readApiV2CategoryListing(['youth-and-community'])).toEqual({
      kind: 'not_found',
    })
    expect(previewTokens()).toEqual([null])
  })

  it("reads a reviewer's listing with the preview token", async () => {
    cookie = 'preview'
    const { readApiV2CategoryListing } = await import('./api-v2-categories')
    await readApiV2CategoryListing(['youth-and-community', 'arts-culture'])
    expect(fetchImpl.mock.calls.map(([url]) => String(url))).toEqual([
      'http://api.example/categories/youth-and-community/arts-culture',
    ])
    expect(previewTokens()).toEqual(['secret'])
  })
})
