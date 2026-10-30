import { createFileRoute } from "@tanstack/react-router";
import { historyQuery, PRELOAD_FRESH } from "../api/queries";
import { parseHistorySearch } from "../workspace/history-screen";

/** One page's history, read-only; `?service=` is the service it was opened from, for the way back. */
export const Route = createFileRoute("/_workspace/history/$pageId")({
  validateSearch: parseHistorySearch,
  loader: ({ context: { queryClient, api }, params }) =>
    void queryClient.prefetchQuery({
      ...historyQuery(api, params.pageId),
      staleTime: PRELOAD_FRESH,
    }),
});
