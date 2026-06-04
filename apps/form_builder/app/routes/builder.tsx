import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { checkSession } from "../server/auth";

export const Route = createFileRoute("/builder")({
  beforeLoad: async () => {
    const user = await checkSession();
    if (!user) {
      throw redirect({ to: "/auth/github" });
    }
    return { user };
  },
  component: BuilderLayout,
});

function BuilderLayout() {
  return <Outlet />;
}
