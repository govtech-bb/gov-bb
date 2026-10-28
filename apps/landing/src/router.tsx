import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { QueryClient } from '@tanstack/react-query'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { routeTree } from './routeTree.gen'
import {
  configureJourney,
  installJourneyClickListener,
  trackPageview,
} from './lib/analytics'

export function getRouter() {
  const queryClient = new QueryClient()

  const router = createTanStackRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: 'intent',
    // Keep hover-preloaded loader data fresh through the click that follows, so
    // `intent` preload actually warms the target instead of being discarded and
    // refetched on click (#2307). Landing content is static, so a 30s window is
    // safe; a genuine revisit past it refetches.
    defaultPreloadStaleTime: 30_000,
  })

  setupRouterSsrQueryIntegration({ router, queryClient })

  // First-party journey events (alongside Umami). Off unless VITE_JOURNEY_URL
  // is set for the environment; both calls are no-ops during SSR.
  configureJourney({
    url: import.meta.env.VITE_JOURNEY_URL as string | undefined,
    app: 'landing',
  })
  installJourneyClickListener()
  // onRendered, not onResolved: onResolved only fires when the router goes from
  // pending to idle, which never happens on the first, server-rendered page or
  // on a click whose loader data the `intent` preload already fetched, so most
  // landing page views were never counted. onRendered fires in the browser on
  // first render and whenever the resolved address changes.
  router.subscribe('onRendered', trackPageview)

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
