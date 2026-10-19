import { expect, test } from "vitest";
import {
  filteredBy,
  pagedTo,
  parseServicesSearch,
  searchedFor,
  servicesTableState,
  sortedBy,
} from "../../src/workspace/services-search";

const place = {
  q: "licence",
  category: "Business and trade",
  status: ["preview" as const, "draft" as const],
  sort: "title" as const,
  order: "asc" as const,
  page: 3,
  size: 50 as const,
};

test("the address keeps the list's place and drops what the list can't show", () => {
  expect(
    parseServicesSearch({ ...place, status: ["draft", "secret", "preview", "draft"] }),
  ).toEqual(place);
  // The router reads JSON where it can, so a number-like search comes back as a number
  expect(parseServicesSearch({ q: 1990 }).q).toBe("1990");
  expect(parseServicesSearch({ q: true }).q).toBe("true");
  expect(parseServicesSearch({ status: "preview" }).status).toEqual(["preview"]);

  expect(
    parseServicesSearch({
      q: "",
      category: ["Health"],
      status: ["secret"],
      sort: "owner",
      order: "up",
      page: -2,
      size: 30,
    }),
  ).toEqual({});
  expect(parseServicesSearch({ q: { words: "licence" }, page: 2.5 })).toEqual({});
  // An order means nothing without the column it sorts
  expect(parseServicesSearch({ order: "asc" }).order).toBeUndefined();
});

test("a new search, filter or sort goes back to the first page; turning pages keeps them", () => {
  expect(searchedFor(place, "hotel")).toEqual({ ...place, q: "hotel", page: undefined });
  expect(searchedFor(place, "")).toMatchObject({ q: undefined });

  expect(filteredBy(place, { category: "", status: ["public", "secret"] })).toEqual({
    ...place,
    category: undefined,
    status: ["public"],
    page: undefined,
  });

  expect(sortedBy(place, "category", true)).toMatchObject({
    sort: "category",
    order: "desc",
    page: undefined,
  });
  // The list's own order, newest change first, isn't written down
  expect(sortedBy(place, "updated_at", true)).toMatchObject({ sort: undefined, order: undefined });
  expect(sortedBy(place, "owner", false)).toMatchObject({ sort: undefined, order: undefined });
  expect(sortedBy(place, "updated_at", false)).toMatchObject({
    sort: "updated_at",
    order: "asc",
  });

  expect(pagedTo(place, 1, 50)).toEqual({ ...place, page: 2 });
  expect(pagedTo(place, 0, 25)).toEqual({ ...place, page: undefined, size: undefined });
});

test("the list's table opens where the address puts it", () => {
  expect(servicesTableState(place)).toEqual({
    globalFilter: "licence",
    columnFilters: [
      { id: "category", value: ["Business and trade"] },
      { id: "visibility", value: ["preview", "draft"] },
    ],
    sorting: [{ id: "title", desc: false }],
    pagination: { pageIndex: 2, pageSize: 50 },
  });

  expect(servicesTableState({})).toEqual({
    globalFilter: "",
    columnFilters: [],
    sorting: [{ id: "updated_at", desc: true }],
    pagination: { pageIndex: 0, pageSize: 25 },
  });
});
