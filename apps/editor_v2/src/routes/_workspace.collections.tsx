import { createFileRoute } from "@tanstack/react-router";
import { primeCollections } from "../workspace/preload";

/** The Collections screen, whose list starts loading as soon as a link to it is pointed at or followed. */
export const Route = createFileRoute("/_workspace/collections")({
  loader: ({ context: { queryClient, api } }) => primeCollections(queryClient, api),
});
