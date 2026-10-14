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
import { DateCell, TextCell } from "./cell-components";
import { SortButton } from "./header-components";
import {
  ColumnsMenu,
  DataTable,
  FilterMenu,
  FilterTabs,
  Pagination,
  Search,
} from "./table-components";

/** Per-column presentation. A secondary column folds away when the table is narrow. */
export type ColumnMeta = { secondary?: boolean };

/** Keeps rows whose value is one of the chosen values; FilterTabs and FilterMenu set it. */
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
  tableComponents: { Search, FilterTabs, FilterMenu, ColumnsMenu, DataTable, Pagination },
  cellComponents: { TextCell, DateCell },
  headerComponents: { SortButton },
});
