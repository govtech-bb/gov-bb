import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The root beforeLoad resolves the viewer level + service statuses through the
// router's QueryClient. Mock the two server functions so we can assert how
// often they are actually invoked across navigations.
const previewMocks = vi.hoisted(() => ({
  resolveViewLevel: vi.fn(async () => ({ level: 'public' as const })),
}))
vi.mock('../lib/preview', () => previewMocks)

const statusMocks = vi.hoisted(() => ({
  getServiceStatuses: vi.fn(async () => [] as [string, string][]),
}))
vi.mock('../lib/service-status', () => statusMocks)

type BeforeLoad = (arg: {
  context: { queryClient: QueryClient }
  location: { search: Record<string, unknown> }
}) => Promise<{ level: string; serviceStatuses: unknown[] }>

async function getBeforeLoad(): Promise<BeforeLoad> {
  const { Route } = await import('./__root')
  return Route.options.beforeLoad as unknown as BeforeLoad
}

const freshClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } })

beforeEach(() => {
  vi.clearAllMocks()
})

describe('root beforeLoad context resolution', () => {
  it('resolves the level and service statuses on first navigation', async () => {
    const beforeLoad = await getBeforeLoad()
    const result = await beforeLoad({
      context: { queryClient: freshClient() },
      location: { search: {} },
    })
    expect(result).toEqual({ level: 'public', serviceStatuses: [] })
    expect(previewMocks.resolveViewLevel).toHaveBeenCalledTimes(1)
    expect(statusMocks.getServiceStatuses).toHaveBeenCalledTimes(1)
  })

  it('serves later navigations from the query cache — no repeat server calls', async () => {
    const beforeLoad = await getBeforeLoad()
    const queryClient = freshClient()
    const arg = { context: { queryClient }, location: { search: {} } }

    await beforeLoad(arg)
    await beforeLoad(arg)
    await beforeLoad(arg)

    // This is the fix for #2307: three navigations, one resolution each.
    expect(previewMocks.resolveViewLevel).toHaveBeenCalledTimes(1)
    expect(statusMocks.getServiceStatuses).toHaveBeenCalledTimes(1)
  })

  it('bypasses the cache when a preview/draft token is present', async () => {
    const beforeLoad = await getBeforeLoad()
    const queryClient = freshClient()

    // Warm the cache with an ordinary navigation.
    await beforeLoad({ context: { queryClient }, location: { search: {} } })
    expect(previewMocks.resolveViewLevel).toHaveBeenCalledTimes(1)

    // A token navigation must resolve fresh (to run cookie/redirect effects),
    // not be served from the warm cache.
    await beforeLoad({
      context: { queryClient },
      location: { search: { preview: 'secret' } },
    })
    expect(previewMocks.resolveViewLevel).toHaveBeenCalledTimes(2)
  })

  it('redirects when a token resolution returns a redirect target', async () => {
    previewMocks.resolveViewLevel.mockResolvedValueOnce({
      level: 'preview',
      redirectTo: '/business-trade',
    } as { level: 'preview'; redirectTo: string })
    const beforeLoad = await getBeforeLoad()

    const thrown = await beforeLoad({
      context: { queryClient: freshClient() },
      location: { search: { preview: 'secret' } },
    }).then(
      () => undefined,
      (e) => e as Record<string, unknown>,
    )
    // TanStack's `redirect()` throws a redirect object carrying the target.
    expect(thrown).toBeDefined()
    expect(JSON.stringify(thrown)).toContain('/business-trade')
  })
})
