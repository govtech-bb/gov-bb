import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from 'vitest'

/**
 * The page read behind `getApiV2Page`, with its real site-version watch, page
 * cache and breaker, against a recording api_v2 behind the global `fetch`. A
 * server function only runs inside Start's request runtime, so its handler,
 * `readApiV2Page`, is called directly; its input type is checked on
 * `getApiV2Page` itself.
 */

vi.mock('nitro/runtime-config', () => ({
  useRuntimeConfig: () => ({ apiV2Url: 'http://api.example' }),
}))
vi.mock('@tanstack/react-start/server', () => ({ getCookie: () => undefined }))

let fetchImpl: ReturnType<typeof vi.fn<typeof fetch>>

beforeEach(() => {
  // A fresh module per test: a fresh version watch, cache and breaker.
  vi.resetModules()
  fetchImpl = vi.fn<typeof fetch>(async (url) =>
    String(url).endsWith('/site-version')
      ? Response.json({ version: 'v1' })
      : Response.json({ error: 'not_found' }, { status: 404 }),
  )
  vi.stubGlobal('fetch', fetchImpl)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('readApiV2Page', () => {
  it.each(['/\u0000a', '/\uD800a', '/a b', '//x', 'x', `/${'a'.repeat(512)}`])(
    'misses %j before any api_v2 request, the version check included',
    async (url) => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      const { readApiV2Page } = await import('./api-v2-page')
      expect(await readApiV2Page(url)).toEqual({
        kind: 'miss',
        reason: 'rejected',
      })
      expect(fetchImpl).not.toHaveBeenCalled()
    },
  )

  it('checks the site version, then asks api_v2 for a page url', async () => {
    const { readApiV2Page } = await import('./api-v2-page')
    expect(await readApiV2Page('/a')).toMatchObject({
      kind: 'miss',
      reason: 'not_found',
    })
    expect(fetchImpl.mock.calls.map(([url]) => String(url))).toEqual([
      'http://api.example/site-version',
      'http://api.example/pages?url=%2Fa',
    ])
  })
})

describe('getApiV2Page', () => {
  it('takes a page url string and nothing else', async () => {
    const { getApiV2Page } = await import('./api-v2-page')
    type Input = Parameters<typeof getApiV2Page>[0]
    expectTypeOf<{ data: string }>().toExtend<Input>()
    expectTypeOf<{ data: number }>().not.toExtend<Input>()
    expectTypeOf<{ data: { url: string } }>().not.toExtend<Input>()
    // Compile-time only: tsc fails if any of these calls type-checks.
    const calls = () => {
      // @ts-expect-error a number is not a page url
      void getApiV2Page({ data: 42 })
      // @ts-expect-error an object is not a page url
      void getApiV2Page({ data: { url: '/a' } })
      // @ts-expect-error the page url is required
      void getApiV2Page()
    }
    expect(calls).toBeTypeOf('function')
  })
})
