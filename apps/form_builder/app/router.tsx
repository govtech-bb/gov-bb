import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    // The auth gates (`/content`, `/builder`) are loader-less layouts, so the
    // router never caches their matches, while their children's loaders are
    // cached. A background (stale-while-revalidate) reload of a cached child
    // renders it with a context built before the fresh gate `beforeLoad`
    // resolved — no `user` (#3026). Blocking reloads rebuild the context first.
    defaultStaleReloadMode: "blocking",
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
