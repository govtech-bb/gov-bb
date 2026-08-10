import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { QueryClient } from '@tanstack/react-query'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { routeTree } from './routeTree.gen'
import { trackPageview } from './lib/analytics'
import { datadogRum } from '@datadog/browser-rum'

// Datadog RUM — browser only (this is an SSR app; never init on the server).
// Guarded on the VITE_DD_RUM_* build env vars injected by the Amplify app (see
// alpha-infra datadog-rum.tf). Session Replay uses mask-user-input: the landing
// site has no PII forms, so page content stays visible while any input fields
// are masked. Runs once at module load on the client.
if (typeof window !== 'undefined') {
  const ddRumApplicationId = import.meta.env.VITE_DD_RUM_APPLICATION_ID
  const ddRumClientToken = import.meta.env.VITE_DD_RUM_CLIENT_TOKEN
  if (ddRumApplicationId && ddRumClientToken) {
    datadogRum.init({
      applicationId: ddRumApplicationId,
      clientToken: ddRumClientToken,
      site: import.meta.env.VITE_DD_RUM_SITE ?? 'datadoghq.com',
      service: import.meta.env.VITE_DD_SERVICE ?? 'gov-bb-landing',
      env: import.meta.env.VITE_DD_ENV ?? 'sandbox',
      sessionSampleRate: 100,
      sessionReplaySampleRate: 100,
      trackUserInteractions: true,
      trackResources: true,
      trackLongTasks: true,
      defaultPrivacyLevel: 'mask-user-input',
    })
  }
}

export function getRouter() {
  const queryClient = new QueryClient()

  const router = createTanStackRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
  })

  setupRouterSsrQueryIntegration({ router, queryClient })

  router.subscribe('onResolved', trackPageview)

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
