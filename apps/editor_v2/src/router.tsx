import { createRouter } from "@tanstack/react-router";
import { createEditorAuth } from "./auth/better-auth-client";
import { parseApiOrigin } from "./auth/session";
import { routeTree } from "./routeTree.gen";

/** Compose browser authentication once per router without running OAuth during shell builds. */
export function getRouter() {
  const origin = parseApiOrigin(import.meta.env.VITE_API_ORIGIN, import.meta.env.PROD);

  if (!origin.ok) throw origin.error;
  const auth = createEditorAuth(origin.value, Date.now);

  return createRouter({
    routeTree,
    context: { auth },
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
