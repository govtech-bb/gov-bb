import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { trackPageview } from './lib/analytics'

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    // Keep hover-preloaded loader data fresh through the click that follows, so
    // `intent` preload actually warms the target instead of being discarded and
    // refetched on click (#2307). Landing content is static, so a 30s window is
    // safe; a genuine revisit past it refetches.
    defaultPreloadStaleTime: 30_000,
  })

  router.subscribe('onResolved', trackPageview)

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
