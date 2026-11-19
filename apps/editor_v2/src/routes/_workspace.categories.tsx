import { createFileRoute } from "@tanstack/react-router";
import { primeCategories } from "../workspace/preload";

/** The Categories screen, whose list starts loading as soon as a link to it is pointed at or followed. */
export const Route = createFileRoute("/_workspace/categories")({
  loader: ({ context: { queryClient, api } }) => primeCategories(queryClient, api),
});
