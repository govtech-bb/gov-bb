import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { ApiFailure, createEditorApi } from "./api/client";
import { createEditorAuth } from "./auth/better-auth-client";
import { bypassAuth } from "./auth/bypass";
import { parseApiOrigin } from "./auth/session";
import { routeTree } from "./routeTree.gen";

/** Compose browser authentication once per router without running OAuth during shell builds. */
export function getRouter() {
  const origin = parseApiOrigin(import.meta.env.VITE_API_ORIGIN, import.meta.env.PROD);

  if (!origin.ok) throw origin.error;

  // Builds compile the bypass out: import.meta.env.DEV is false there.
  const auth =
    import.meta.env.DEV && import.meta.env.VITE_AUTH_BYPASS === "true"
      ? bypassAuth
      : createEditorAuth(origin.value, Date.now);

  const api = createEditorApi(origin.value, import.meta.env.VITE_LANDING_ORIGIN);

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // A refusal answers the same way however often it is asked.
        retry: (failures, error) =>
          failures < 3 &&
          !(error instanceof ApiFailure && error.status >= 400 && error.status < 500),
      },
    },
  });

  return createRouter({
    routeTree,
    context: { auth, api },
    Wrap: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
    defaultPreload: false,
    notFoundMode: "root",
    defaultPendingComponent: () => (
      <p role="status" className="p-6">
        Loading editor…
      </p>
    ),
    scrollRestoration: true,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
