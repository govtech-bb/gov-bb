import { createFileRoute } from "@tanstack/react-router";
import { parseCollectionSearch } from "../workspace/collections/collection-search";
import { primeCollection } from "../workspace/preload";

/**
 * A collection's records. `?record=<record key>` opens that record's dialog, so a page's block can link straight to
 * the record it shows.
 */
export const Route = createFileRoute("/_workspace/collections/$key")({
  validateSearch: parseCollectionSearch,
  loader: ({ context: { queryClient, api }, params }) =>
    primeCollection(queryClient, api, params.key),
});
