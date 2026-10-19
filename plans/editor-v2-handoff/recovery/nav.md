# Unreviewed nav worktree recovery snapshot

Source: `/private/tmp/claude-501/-Users-phrog-Code-work-gov-bb/f9381145-23fe-41a0-a9b6-1f904ff93cae/scratchpad/wt/nav`.

This is an archival Markdown snapshot, not approved implementation. The tracked patch is relative to the recorded HEAD and includes both staged and unstaged changes. The untracked files below must also be recovered. Do not apply blindly to the integration branch.

## Base and original status

```text
3be1e7497d62191c3f2e3595bed85308c0c2f46f
 M apps/editor_v2/src/routes/_workspace.services.tsx
 M apps/editor_v2/src/ui/table/table-components.tsx
 M apps/editor_v2/src/workspace/services-list.tsx
?? apps/editor_v2/src/workspace/services-search.ts
```

## Tracked patch

````diff
diff --git a/apps/editor_v2/src/routes/_workspace.services.tsx b/apps/editor_v2/src/routes/_workspace.services.tsx
index df30aab5cf017478663ba67698fab0ca5e844962..0929b87cac84aa1d009bb674fa3da84f6823246d 100644
--- a/apps/editor_v2/src/routes/_workspace.services.tsx
+++ b/apps/editor_v2/src/routes/_workspace.services.tsx
@@ -1,3 +1,7 @@
 import { createFileRoute } from "@tanstack/react-router";
+import { parseServicesSearch } from "../workspace/services-search";
 
-export const Route = createFileRoute("/_workspace/services")({});
+/** The Services list keeps its search, filters, sort and page in its address. */
+export const Route = createFileRoute("/_workspace/services")({
+  validateSearch: parseServicesSearch,
+});
diff --git a/apps/editor_v2/src/ui/table/table-components.tsx b/apps/editor_v2/src/ui/table/table-components.tsx
index c236348ef8cccd61939539d606392aebf5939be8..b2675addcfba74194edaddbfb739c2d39fa6bf0f 100644
--- a/apps/editor_v2/src/ui/table/table-components.tsx
+++ b/apps/editor_v2/src/ui/table/table-components.tsx
@@ -6,7 +6,7 @@ import {
   MagnifyingGlass,
   X,
 } from "@phosphor-icons/react";
-import { useId } from "react";
+import { useId, type ReactNode } from "react";
 import { cn } from "../../cn";
 import { Button } from "../button";
 import { hiddenControlFocus } from "../focus";
@@ -188,7 +188,8 @@ export function DataTable({
 }: {
   caption: string;
   loading?: boolean;
-  empty: { title: string; hint: string };
+  /** With nothing to list: what to say, and the action that makes the first row. */
+  empty: { title: string; hint: string; action?: ReactNode };
 }) {
   const table = useTableContext();
   const rows = table.getRowModel().rows;
@@ -268,7 +269,10 @@ export function DataTable({
                     Clear filters
                   </Button>
                 ) : (
-                  <p className="mt-1 text-14 text-muted">{empty.hint}</p>
+                  <>
+                    <p className="mt-1 text-14 text-muted">{empty.hint}</p>
+                    {empty.action && <div className="mt-4">{empty.action}</div>}
+                  </>
                 )}
               </td>
             </tr>
diff --git a/apps/editor_v2/src/workspace/services-list.tsx b/apps/editor_v2/src/workspace/services-list.tsx
index f56ebf64f59454939f8e80fcb410b42625ec1ea2..c140e7233ee1c71122e4551c7cb6ae70f7122a4a 100644
--- a/apps/editor_v2/src/workspace/services-list.tsx
+++ b/apps/editor_v2/src/workspace/services-list.tsx
@@ -12,12 +12,24 @@ import { Field } from "../ui/field";
 import { Input } from "../ui/input";
 import { NativeSelect } from "../ui/native-select";
 import { createAppColumnHelper, useAppTable, useTableContext } from "../ui/table/table-hooks";
+import {
+  filteredBy,
+  pagedTo,
+  searchedFor,
+  servicesTableState,
+  sortedBy,
+  type ServicesSearch,
+} from "./services-search";
 
 const column = createAppColumnHelper<ServiceSummary>();
 
-// A stable empty list: a new [] each render would reset the table's page every render.
+// A stable empty list: a new [] each render would make the table recount its rows every render
 const loading: ServiceSummary[] = [];
 
+/** A table state change, which is the new state or makes it from the old one. */
+const resolve = <T,>(change: T | ((old: T) => T), old: T) =>
+  change instanceof Function ? change(old) : change;
+
 const visibilities = ["public", "preview", "draft"] as const;
 
 const visibilityLabel = (visibility: string) => visibilityLabels.get(visibility) ?? visibility;
@@ -95,8 +107,7 @@ const serviceColumns = (api: EditorApi) =>
       meta: { secondary: true },
       cell: ({ cell }) => <cell.DateCell />,
     }),
-    column.accessor((service) => visibilityLabel(service.visibility), {
-      id: "visibility",
+    column.accessor("visibility", {
       header: "Status",
       sortFn: "text",
       filterFn: "oneOf",
@@ -143,33 +154,45 @@ function ServiceFilters({ categories }: { categories: readonly string[] }) {
       </Field>
       <fieldset>
         <legend className="mb-1.5 font-semibold">Status</legend>
-        {visibilities.map((visibility) => {
-          const label = visibilityLabel(visibility);
-
-          return (
-            <Checkbox
-              key={visibility}
-              label={label}
-              className="py-1"
-              checked={statuses.includes(label)}
-              onCheckedChange={(checked) =>
-                choose(
-                  "visibility",
-                  checked ? [...statuses, label] : statuses.filter((value) => value !== label),
-                )
-              }
-            />
-          );
-        })}
+        {visibilities.map((visibility) => (
+          <Checkbox
+            key={visibility}
+            label={visibilityLabel(visibility)}
+            className="py-1"
+            checked={statuses.includes(visibility)}
+            onCheckedChange={(checked) =>
+              choose(
+                "visibility",
+                checked
+                  ? [...statuses, visibility]
+                  : statuses.filter((value) => value !== visibility),
+              )
+            }
+          />
+        ))}
       </fieldset>
     </div>
   );
 }
 
-/** The api_v2 estate, newest change first; each service opens in the editor at its entry page. */
-export function ServicesList({ api, onCreate }: { api: EditorApi; onCreate: () => void }) {
+/**
+ * The api_v2 estate, newest change first; each service opens in the editor at its entry page. Where the author is in
+ * it (search, filters, sort and page) is `search`, the list's address, and every change replaces it.
+ */
+export function ServicesList({
+  api,
+  search,
+  onSearch,
+  onCreate,
+}: {
+  api: EditorApi;
+  search: ServicesSearch;
+  onSearch: (search: ServicesSearch) => void;
+  onCreate: () => void;
+}) {
   const services = useQuery(servicesQuery(api));
   const columns = useMemo(() => serviceColumns(api), [api]);
+  const state = useMemo(() => servicesTableState(search), [search]);
 
   const categories = useMemo(
     () =>
@@ -183,9 +206,30 @@ export function ServicesList({ api, onCreate }: { api: EditorApi; onCreate: () =
     columns,
     data: services.data ?? loading,
     getRowId: (service) => service.id,
-    initialState: {
-      sorting: [{ id: "updated_at", desc: true }],
-      pagination: { pageIndex: 0, pageSize: 25 },
+    state,
+    // A new search, filter or sort goes back to the first page itself, so a page from the address survives the load
+    autoResetPageIndex: false,
+    enableSortingRemoval: false,
+    onGlobalFilterChange: (change) =>
+      onSearch(searchedFor(search, String(resolve(change, state.globalFilter)))),
+    onColumnFiltersChange: (change) => {
+      const filters = resolve(change, state.columnFilters);
+
+      // SAFETY: Only the filters beside the list set these, always as the string arrays oneOf reads.
+      const chosen = (id: string) =>
+        filters.find((filter) => filter.id === id)?.value as string[] | undefined;
+
+      onSearch(filteredBy(search, { category: chosen("category")?.[0], status: chosen("visibility") }));
+    },
+    onSortingChange: (change) => {
+      const [sorted = { id: "updated_at", desc: true }] = resolve(change, state.sorting);
+
+      onSearch(sortedBy(search, sorted.id, sorted.desc));
+    },
+    onPaginationChange: (change) => {
+      const { pageIndex, pageSize } = resolve(change, state.pagination);
+
+      onSearch(pagedTo(search, pageIndex, pageSize));
     },
   });
 
@@ -216,7 +260,12 @@ export function ServicesList({ api, onCreate }: { api: EditorApi; onCreate: () =
               loading={services.isPending}
               empty={{
                 title: "No services yet",
-                hint: "Services appear here when pages are added to the content API.",
+                hint: "Create one to write its entry page.",
+                action: (
+                  <Button variant="secondary" onClick={onCreate}>
+                    Create service
+                  </Button>
+                ),
               }}
             />
           )}
````

## Untracked files

### apps/editor_v2/src/workspace/services-search.ts

````text
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
 * by default is left out: the newest change first, on the first page of 25.
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

const text = (value: SearchValue | undefined) =>
  value === undefined || value === null || value === "" ? undefined : String(value);

/**
 * The list's place from its address. Anything the list can't show is dropped, so an old or edited link still opens
 * the list, at the nearest place it can.
 */
export function parseServicesSearch(search: {
  readonly [key: string]: SearchValue;
}): ServicesSearch {
  const status = [search.status ?? []].flat().flatMap((value) => oneOf(visibilities, value) ?? []);
  const sort = oneOf(sorts, search.sort);
  const page = Number(search.page);

  return {
    q: text(search.q),
    category: text(search.category),
    status: status.length ? status : undefined,
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
export function filteredBy(
  search: ServicesSearch,
  filters: { category?: string; status?: readonly string[] },
): ServicesSearch {
  const status = (filters.status ?? []).flatMap((value) => oneOf(visibilities, value) ?? []);

  return {
    ...search,
    page: undefined,
    category: filters.category || undefined,
    status: status.length ? status : undefined,
  };
}

/** The list's place sorted by a column, which is the newest change first unless the author chose another. */
export function sortedBy(search: ServicesSearch, column: string, desc: boolean): ServicesSearch {
  const sort = oneOf(sorts, column);
  const newestFirst = sort === "updated_at" && desc;

  return {
    ...search,
    page: undefined,
    sort: newestFirst ? undefined : sort,
    order: newestFirst || !sort ? undefined : desc ? "desc" : "asc",
  };
}

/** The list's place on another page, or with a different number of rows per page. */
export function pagedTo(search: ServicesSearch, index: number, size: number): ServicesSearch {
  return { ...search, page: index > 0 ? index + 1 : undefined, size: oneOf(sizes, size) };
}

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
````
