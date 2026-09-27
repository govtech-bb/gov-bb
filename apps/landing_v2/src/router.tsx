import {
  createRouter as createTanStackRouter,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  return createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    // The default rather than the root's own, because a route does not
    // inherit its parent's error component: set on the root alone, it would
    // never see a failure in the index or page loaders.
    defaultErrorComponent: LoadError,
  });
}

/**
 * A loader failure, message in full.
 *
 * Assumption (#2702): 14 — this is a spike, not a public site, so the page
 * says exactly what went wrong: api_v2 unreachable (served as a 503), or a
 * document that failed validation, named by its slug and the field path.
 */
function LoadError({ error }: ErrorComponentProps) {
  return (
    <div className="bk-document">
      <h1 className="bk-title">This page could not be loaded</h1>
      <p className="bk-paragraph">{error.message}</p>
    </div>
  );
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
