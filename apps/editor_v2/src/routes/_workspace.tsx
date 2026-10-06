import { createFileRoute, redirect } from "@tanstack/react-router";
import { App } from "../app";
import { localReturnPath } from "../auth/session";

/** Gate workspace rendering; preloading must never initiate OAuth. */
export const Route = createFileRoute("/_workspace")({
  ssr: false,
  beforeLoad: async ({ context, location, preload }) => {
    if (preload) return {};
    const result = await context.auth.session();

    if (result.ok && result.value) return { employee: result.value };
    throw redirect({
      to: "/auth",
      search: {
        state: result.ok ? "sign-in" : "error",
        returnTo: localReturnPath(location.href),
        reason: "unavailable",
      },
      replace: true,
    });
  },
  component: WorkspacePage,
});

function WorkspacePage() {
  const { auth, employee } = Route.useRouteContext();

  return employee ? <App auth={auth} employee={employee} /> : null;
}
