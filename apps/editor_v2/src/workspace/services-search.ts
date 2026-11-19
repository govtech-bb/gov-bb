import type { ServiceSummary } from "../api/client";

/** A value in the address's search as the router reads it: the JSON it holds, or else its text. */
type SearchValue =
  | string
  | number
  | boolean
  | null
  | readonly SearchValue[]
  | { readonly [key: string]: SearchValue };

type Visibility = ServiceSummary["visibility"];

const visibilities: readonly Visibility[] = ["public", "preview", "draft"];

const sorts = ["title", "category", "updated_at", "visibility"] as const;

const orders = ["asc", "desc"] as const;

// Rows per page besides the 25 the list starts with
const sizes = [50, 100] as const;

/**
 * Where an author is in the Services list, kept in its address so every way back returns to it. What the list does
 * by default is left out: every service, newest change first, on the first page of 25.
 */
export type ServicesSearch = {
  /** The search box's words. */
  q?: string;
  /** The one category shown. */
  category?: string;
  /** The statuses shown. */
  status?: Visibility[];
  /** The column the list is sorted by, in `order`. */
  sort?: (typeof sorts)[number];
  order?: (typeof orders)[number];
  /** Counted from 1. */
  page?: number;
  size?: (typeof sizes)[number];
};

const oneOf = <T extends SearchValue>(options: readonly T[], value: SearchValue | undefined) =>
  options.find((option) => option === value);

// Words, though the router reads a number or true from an address as JSON; a list or object is no search
const text = (value: SearchValue | undefined) =>
  value === undefined || value === null || value === "" || value instanceof Object
    ? undefined
    : String(value);

/** The statuses among `values`, each once and in the list's order. */
const statuses = (values: readonly SearchValue[]) => {
  const chosen = visibilities.filter((visibility) => values.includes(visibility));

  return chosen.length ? chosen : undefined;
};

/**
 * The list's place from its address. Anything the list can't show is dropped, so an old or edited link still opens
 * the list, at the nearest place it can.
 */
export function parseServicesSearch(search: {
  readonly [key: string]: SearchValue;
}): ServicesSearch {
  const sort = oneOf(sorts, search.sort);
  const page = Number(search.page);

  return {
    q: text(search.q),
    category: text(search.category),
    status: statuses([search.status ?? []].flat()),
    sort,
    order: sort && oneOf(orders, search.order),
    page: Number.isSafeInteger(page) && page > 1 ? page : undefined,
    size: oneOf(sizes, search.size),
  };
}

/** The list's place after its search changes: back to the first page. */
export const searchedFor = (search: ServicesSearch, q: string): ServicesSearch => ({
  ...search,
  page: undefined,
  q: q || undefined,
});

/** The list's place after its filters change: back to the first page. */
export const filteredBy = (
  search: ServicesSearch,
  filters: { category?: string; status?: readonly string[] },
): ServicesSearch => ({
  ...search,
  page: undefined,
  category: filters.category || undefined,
  status: statuses(filters.status ?? []),
});

/** The list's place sorted by a column, which is the newest change first unless the author chose another. */
export function sortedBy(search: ServicesSearch, column: string, desc: boolean): ServicesSearch {
  const sort = oneOf(sorts, column);
  const newestFirst = !sort || (sort === "updated_at" && desc);

  return {
    ...search,
    page: undefined,
    sort: newestFirst ? undefined : sort,
    order: newestFirst ? undefined : desc ? "desc" : "asc",
  };
}

/** The list's place on another page, or with a different number of rows per page. */
export const pagedTo = (search: ServicesSearch, index: number, size: number): ServicesSearch => ({
  ...search,
  page: index > 0 ? index + 1 : undefined,
  size: oneOf(sizes, size),
});

/** The list table's state at the list's place. */
export function servicesTableState(search: ServicesSearch) {
  return {
    globalFilter: search.q ?? "",
    columnFilters: [
      ...(search.category ? [{ id: "category", value: [search.category] }] : []),
      ...(search.status ? [{ id: "visibility", value: search.status }] : []),
    ],
    sorting: [
      search.sort
        ? { id: search.sort, desc: search.order === "desc" }
        : { id: "updated_at", desc: true },
    ],
    pagination: { pageIndex: (search.page ?? 1) - 1, pageSize: search.size ?? 25 },
  };
}
