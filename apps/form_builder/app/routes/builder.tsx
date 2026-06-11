import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
// Shared transition/tooltip/tab classes (t-*, cms-tabs) used by the section
// switch and Tip tooltips in the builder header. Global by design; importing
// here as well as from content.tsx is deduped by the bundler.
import "./content/-transitions.css";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { checkSession } from "../server/auth";

export const Route = createFileRoute("/builder")({
  beforeLoad: async () => {
    // Dev-only escape hatch, mirroring /content's: lets the builder be viewed
    // locally without GitHub OAuth. `import.meta.env.DEV` is statically
    // `false` in the production build, so this branch is dead-code-eliminated
    // there and the real gate below always runs in prod.
    if (import.meta.env.DEV) {
      return { user: { login: "dev" } };
    }
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
