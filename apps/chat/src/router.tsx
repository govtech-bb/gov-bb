import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { configureJourney, trackPageview } from "@govtech-bb/analytics";
import { routeTree } from "./routeTree.gen";

// TanStack Router setup. `defaultPreload: "intent"` warms a route on link
// hover/focus; `staleTime: 0` stops those preloads from counting as fresh, so
// the real navigation still loads current data.
export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
  });

  // Analytics, as on landing: first-party journey events go to /journey only
  // when VITE_JOURNEY_URL is set, and Umami only when its script loaded (see
  // __root.tsx). Both calls are no-ops during SSR.
  configureJourney({
    url: import.meta.env.VITE_JOURNEY_URL as string | undefined,
    app: "chat",
  });
  // One page view per pathname, the first load included: removing landing's
  // ?q= after it is sent changes the address, and is not a new page.
  let lastPath: string | undefined;
  router.subscribe("onRendered", ({ toLocation }) => {
    if (toLocation.pathname === lastPath) return;
    lastPath = toLocation.pathname;
    trackPageview();
  });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
