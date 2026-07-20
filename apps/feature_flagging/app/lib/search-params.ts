import { z } from "zod";
import type { SortDir, SortKey } from "./catalogue";
import type { ServiceStatus } from "./service-status";

/** The status dropdown adds `all` to the three real service statuses. */
export type StatusFilter = ServiceStatus | "all";

/** The services table's full view state, mirrored in the URL search params. */
export interface ServicesSearch {
  q: string;
  category: string;
  type: string;
  status: StatusFilter;
  sortKey: SortKey;
  sortDir: SortDir;
}

/**
 * The default view — what a bare `/` URL means. These values are stripped from
 * the URL when active (see `stripDefaults`) so an unfiltered table stays at `/`.
 * `status` + `asc` reproduces the original table default: enabled at the top,
 * alphabetical within each status group.
 */
export const DEFAULT_SEARCH: ServicesSearch = {
  q: "",
  category: "all",
  type: "all",
  status: "all",
  sortKey: "status",
  sortDir: "asc",
};

// Each field `.catch`es to its default so a hand-edited or stale URL never throws
// — an unknown status/sort value silently falls back rather than 500ing the page.
// `category`/`type` are free strings (their valid set is data-dependent); a value
// that matches no row simply yields an empty table, same as an over-narrow filter.
const SearchSchema = z.object({
  q: z.string().catch(DEFAULT_SEARCH.q),
  category: z.string().catch(DEFAULT_SEARCH.category),
  type: z.string().catch(DEFAULT_SEARCH.type),
  status: z
    .enum(["all", "enabled", "form_disabled", "disabled"])
    .catch(DEFAULT_SEARCH.status),
  sortKey: z
    .enum(["service", "category", "type", "status"])
    .catch(DEFAULT_SEARCH.sortKey),
  sortDir: z.enum(["asc", "desc"]).catch(DEFAULT_SEARCH.sortDir),
});

/** Parse raw URL search into a fully-defaulted `ServicesSearch`. */
export function parseSearch(raw: unknown): ServicesSearch {
  return SearchSchema.parse(raw);
}

/**
 * Keep only the fields that differ from the default view. TanStack Router omits
 * absent search values from the URL, so a base view serialises to a bare `/` and
 * every URL carries just the filters/sort the user actually changed.
 */
export function stripDefaults(s: ServicesSearch): Partial<ServicesSearch> {
  const out: Partial<ServicesSearch> = {};
  if (s.q !== DEFAULT_SEARCH.q) out.q = s.q;
  if (s.category !== DEFAULT_SEARCH.category) out.category = s.category;
  if (s.type !== DEFAULT_SEARCH.type) out.type = s.type;
  if (s.status !== DEFAULT_SEARCH.status) out.status = s.status;
  if (s.sortKey !== DEFAULT_SEARCH.sortKey) out.sortKey = s.sortKey;
  if (s.sortDir !== DEFAULT_SEARCH.sortDir) out.sortDir = s.sortDir;
  return out;
}
