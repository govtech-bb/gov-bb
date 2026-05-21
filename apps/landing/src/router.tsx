import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { QueryClient } from '@tanstack/react-query'
import { routeTree } from './routeTree.gen'
import { trackPageview } from './lib/analytics'

export const queryClient = new QueryClient()

export const router = createTanStackRouter({
  routeTree,
  context: { queryClient },
  scrollRestoration: true,
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
})

router.subscribe('onResolved', trackPageview)

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
