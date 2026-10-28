import { createFileRoute } from "@tanstack/react-router";

/** One page's change waiting for review, compared with the live page. */
export const Route = createFileRoute("/_workspace/reviews/$pageId")({});
