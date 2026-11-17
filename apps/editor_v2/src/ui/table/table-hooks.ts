import {
  columnFilteringFeature,
  columnVisibilityFeature,
  constructFilterFn,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  createTableHook,
  filterFn_includesString,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_basic,
  sortFn_text,
  tableFeatures,
} from "@tanstack/react-table";
import { DateCell } from "./cell-components";
import { SortButton } from "./header-components";
import { DataTable, Pagination, Search } from "./table-components";

/**
 * Per-column presentation. A secondary column folds away when the table is narrow. `width` is the column's width as a
 * class, such as `w-36`, so it stays put whatever its rows hold; the leading column has none and takes the rest.
 * `align: "end"` lines its header and its cells up at their end, as for a count or a row's actions.
 */
export type ColumnMeta = { secondary?: boolean; width?: string; align?: "end" };

/** Keeps rows whose value is one of the chosen values, as a list's filters choose them. */
const oneOf = constructFilterFn({
  filter: (value: string, chosen: string[]) => chosen.includes(value),
  autoRemove: (chosen?: string[]) => !chosen?.length,
});

/**
 * Every list in the editor shares these features and components, after TanStack's composable-tables example.
 * A list supplies only its columns (`createAppColumnHelper<Row>()`) and data (`useAppTable`).
 */
export const {
  createAppColumnHelper,
  useAppTable,
  useTableContext,
  useCellContext,
  useHeaderContext,
} = createTableHook({
  features: tableFeatures({
    rowSortingFeature,
    sortedRowModel: createSortedRowModel(),
    sortFns: { text: sortFn_text, basic: sortFn_basic },
    columnFilteringFeature,
    globalFilteringFeature,
    filteredRowModel: createFilteredRowModel(),
    filterFns: { includesString: filterFn_includesString, oneOf },
    rowPaginationFeature,
    paginatedRowModel: createPaginatedRowModel(),
    columnVisibilityFeature,
    // SAFETY: A type-only slot; TanStack reads its type, never its value.
    columnMeta: {} as ColumnMeta,
  }),
  globalFilterFn: "includesString",
  tableComponents: { Search, DataTable, Pagination },
  cellComponents: { DateCell },
  headerComponents: { SortButton },
});

/** Whether search words or a filter leave rows out, and how to show every row again. */
export function useTableFilters() {
  const table = useTableContext();

  return {
    filtered: !!table.state.globalFilter || table.state.columnFilters.length > 0,
    clear: () => {
      table.resetGlobalFilter(true);
      table.resetColumnFilters(true);
    },
  };
}
