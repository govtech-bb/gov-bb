import { createFileRoute } from "@tanstack/react-router";
import { primeSitePage } from "../workspace/preload";

/** A standalone site page opens by id, including on a cold deep link. */
export const Route = createFileRoute("/_workspace/site-pages/$pageId")({
  loader: ({ context: { queryClient, api }, params }) =>
    primeSitePage(queryClient, api, params.pageId),
});
