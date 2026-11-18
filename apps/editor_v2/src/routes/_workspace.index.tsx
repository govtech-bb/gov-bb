import { createFileRoute, redirect } from "@tanstack/react-router";

/** The editor's home is the Services list; a document opens only when the author chooses it. */
export const Route = createFileRoute("/_workspace/")({
  beforeLoad: () => {
    throw redirect({ to: "/services", replace: true });
  },
});
