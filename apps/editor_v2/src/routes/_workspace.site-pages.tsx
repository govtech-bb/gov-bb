import { createFileRoute } from "@tanstack/react-router";
import { primeSitePages } from "../workspace/preload";

/** Existing site information pages, separate from service workspaces. */
export const Route = createFileRoute("/_workspace/site-pages")({
  loader: ({ context: { queryClient, api } }) => primeSitePages(queryClient, api),
});
