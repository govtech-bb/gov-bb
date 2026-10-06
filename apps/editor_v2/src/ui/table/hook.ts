import {
  columnFilteringFeature,
  columnVisibilityFeature,
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
import { DataTable, Pagination, Toolbar } from "./table-components";

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
    filterFns: { includesString: filterFn_includesString },
    rowPaginationFeature,
    paginatedRowModel: createPaginatedRowModel(),
    columnVisibilityFeature,
  }),
  globalFilterFn: "includesString",
  tableComponents: { Toolbar, DataTable, Pagination },
  cellComponents: { TextCell, DateCell },
  headerComponents: { SortButton },
});
