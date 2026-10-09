import type { FastifyBaseLogger } from "fastify";
import type { ContentStoreUnavailable, PageRejected } from "../modules/page";
import type { PageLocked } from "../modules/page-lock";

/** Public content may be shared by the site and its caches. */
export const PUBLIC_READ =
  "public, max-age=60, stale-while-revalidate=300, stale-if-error=86400";
/** Authenticated and preview responses must never enter a browser or shared cache. */
export const EDITOR_READ = "no-store";
/** A short negative cache keeps missing public URLs inexpensive. */
export const NOT_FOUND_READ = "public, max-age=10";

/** Database errors can carry SQL parameters, so only the failed operation is logged. */
export function storageFailed(
  log: FastifyBaseLogger,
  error: ContentStoreUnavailable,
) {
  log.error(
    { failure: "store_unavailable", operation: error.operation },
    "request failed",
  );
  return { error: "internal_error" };
}

/** A write refused because someone else is editing the page: who, and until when. */
export function locked(error: PageLocked) {
  return { error: "locked" as const, message: error.message, lock: error.lock };
}

/** A refused write, as the per-field 422 an editor can act on. */
export function rejected(error: PageRejected) {
  return {
    error: "validation_failed" as const,
    message: error.message,
    errors: [...error.errors],
  };
}
