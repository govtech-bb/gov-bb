import { createFileRoute } from "@tanstack/react-router";
import { primeRevision } from "../workspace/preload";

/** One page's change waiting for review, compared with the live page; it starts loading as its link is pointed at. */
export const Route = createFileRoute("/_workspace/reviews/$pageId")({
  loader: ({ context: { queryClient, api }, params }) =>
    primeRevision(queryClient, api, params.pageId),
});
