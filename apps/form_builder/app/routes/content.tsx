import "@fontsource/inter/400.css";
import "./content/-transitions.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { checkSession } from "../server/auth";

/**
 * Standalone route tree for the landing **content CMS**, kept fully separate
 * from `/builder` so it can't disturb the builder's draft/deploy state. Same
 * GitHub-OAuth gate as the builder layout. All of its code is colocated under
 * `app/routes/content/` (dash-prefixed helpers + lib/render/server/styles).
 */
export const Route = createFileRoute("/content")({
  beforeLoad: async () => {
    // Dev-only escape hatch: lets the editor be viewed locally without GitHub
    // OAuth (and a running API). `import.meta.env.DEV` is statically `false` in
    // the production build, so this branch is dead-code-eliminated there and
    // the real gate below always runs in prod.
    if (import.meta.env.DEV) {
      return { user: { login: "dev" } };
    }
    const user = await checkSession();
    if (!user) {
      throw redirect({ to: "/auth/github" });
    }
    return { user };
  },
  component: ContentLayout,
});

function ContentLayout() {
  return <Outlet />;
}
