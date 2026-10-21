import { createFileRoute, redirect } from "@tanstack/react-router";
import { App } from "../app";
import { AuthPending } from "../auth/auth-screen";
import { localReturnPath, workspaceAdmission } from "../auth/session";

const admit = workspaceAdmission(Date.now);

/** Gate workspace rendering; preloading must never initiate OAuth. */
export const Route = createFileRoute("/_workspace")({
  ssr: false,
  pendingMs: 0,
  pendingMinMs: 0,
  pendingComponent: () => <AuthPending label="Checking your session…" />,
  beforeLoad: async ({ context, location, preload, cause }) => {
    if (preload) return {};
    const result = await admit(cause === "stay" ? "stay" : "enter", () => context.auth.session());

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
  const { auth, api, employee } = Route.useRouteContext();

  return employee ? <App auth={auth} api={api} employee={employee} /> : null;
}
