import { createFileRoute } from "@tanstack/react-router";
import { primeReviewQueue } from "../workspace/preload";

/** The review queue, which starts loading as soon as a link to it is pointed at or followed. */
export const Route = createFileRoute("/_workspace/reviews")({
  loader: ({ context: { queryClient, api } }) => primeReviewQueue(queryClient, api),
});
