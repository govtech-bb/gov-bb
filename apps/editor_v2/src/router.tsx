import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { createEditorApi } from "./api/client";
import { retryContentRead } from "./api/queries";
import { createEditorAuth } from "./auth/better-auth-client";
import { authBypassed, bypassAuth } from "./auth/bypass";
import { parseApiOrigin } from "./auth/session";
import { routeTree } from "./routeTree.gen";
import { RouteError } from "./route-error";

/** Compose browser authentication once per router without running OAuth during shell builds. */
export function getRouter() {
  const origin = parseApiOrigin(import.meta.env.VITE_API_ORIGIN, import.meta.env.PROD);

  if (!origin.ok) throw origin.error;

  // Builds compile the bypass out: import.meta.env.DEV is false there.
  const auth = authBypassed ? bypassAuth : createEditorAuth(origin.value, Date.now);

  const api = createEditorApi(origin.value, import.meta.env.VITE_LANDING_ORIGIN);

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: retryContentRead,
      },
    },
  });

  return createRouter({
    routeTree,
    context: { auth, api, queryClient },
    Wrap: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
    // A link pointed at or focused starts loading its screen, so it opens at once when followed
    defaultPreload: "intent",
    notFoundMode: "root",
    defaultErrorComponent: RouteError,
    defaultPendingMinMs: 0,
    scrollRestoration: true,
    // By page rather than by visit, so going back to a page by any link returns to where it was read
    getScrollRestorationKey: (location) => location.pathname,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
