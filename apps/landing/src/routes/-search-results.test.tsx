/**
 * @vitest-environment jsdom
 */
import { QueryClient } from '@tanstack/react-query'
import { createMemoryHistory, createRouter } from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { routeTree } from '../routeTree.gen'
import { Route } from './search-results'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('/search-results', () => {
  it('reloads its api_v2 documents for each new query', async () => {
    const queryClient = new QueryClient()
    // Fresh root queries, so beforeLoad reads them instead of calling the server.
    queryClient.setQueryData(['root', 'view-level'], 'public')
    queryClient.setQueryData(['root', 'service-statuses'], [])
    queryClient.setQueryData(['root', 'category-tree'], { kind: 'disabled' })
    // The route declares a loader; its option type is optional, so name it.
    const loader = vi.spyOn(
      Route.options as { loader: () => unknown },
      'loader',
    )

    const router = createRouter({
      routeTree,
      context: { queryClient },
      history: createMemoryHistory({
        initialEntries: ['/search-results?q=birth'],
      }),
    })
    await router.load()
    await router.navigate({ to: '/search-results', search: { q: 'marriage' } })

    expect(loader).toHaveBeenCalledTimes(2)
  })
})
