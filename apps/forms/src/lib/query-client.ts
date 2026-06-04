import { QueryClient } from "@tanstack/react-query";

/**
 * Application-wide QueryClient.
 *
 * Two classes of data live here:
 *
 *  • service-contract  — raw ServiceContract from the API, mapped to
 *    ClientServiceContract.  Re-validated every minute so version changes
 *    are picked up on the next navigation.
 *
 *  • form-schema       — fully-built FormMeta (Zod schema + steps + defaults).
 *    Keyed by [formId, version] so a version bump automatically produces a
 *    fresh entry.  staleTime: Infinity because the same (formId, version)
 *    pair is deterministic and never needs rebuilding.
 *
 * The gcTime (5 min for contracts, 30 min for built forms) controls how long
 * unused entries remain in memory after all subscribers dismount.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Avoid hammering the API on every mount; let loaders control freshness.
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      // Single automatic retry on transient network errors.
      retry: 1,
      // Do not refetch when a tab regains focus — form schema doesn't change
      // mid-session.
      refetchOnWindowFocus: false,
    },
  },
});
