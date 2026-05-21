import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { NotFound } from "@forms/components";
import type { QueryClient } from "@tanstack/react-query";

/**
 * Router context shape.  The QueryClient is injected here from main.tsx so
 * every route loader can call `context.queryClient.ensureQueryData()` without
 * importing the singleton directly.
 */
export interface RouterContext {
  queryClient: QueryClient;
}

const RootLayout = () => (
  <>
    <Outlet />
    <TanStackRouterDevtools />
  </>
);

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFound,
});
