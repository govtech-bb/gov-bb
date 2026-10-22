import { CaretDown, CaretLeft, CaretRight, Columns, MagnifyingGlass } from "@phosphor-icons/react";
import { useId, type Ref } from "react";
import { cn } from "../../cn";
import { Button } from "../button";
import { EmptyState, type EmptyStateProps } from "../empty-state";
import { hiddenControlFocus } from "../focus";
import { Input } from "../input";
import { NativeSelect } from "../native-select";
import { Menu } from "../menu";
import { Tag } from "../tag";
import { useTableFilters, useTableContext } from "./table-hooks";

/** Narrow tables fold secondary columns into the leading cell instead of scrolling them away. */
const secondary = "@max-3xl:hidden";

/** Search across every searchable column, in the toolbar over the table. */
export function Search({
  label,
  placeholder,
  ref,
  className,
}: {
  label: string;
  placeholder: string;
  ref?: Ref<HTMLInputElement>;
  /** For the box around the field and its icon, such as its width in the toolbar. */
  className?: string;
}) {
  const table = useTableContext();

  return (
    <div className={cn("relative min-w-0", className)}>
      <MagnifyingGlass
        aria-hidden="true"
        className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted"
      />
      <Input
        ref={ref}
        type="search"
        size="sm"
        aria-label={label}
        placeholder={placeholder}
        className="ps-8"
        value={table.state.globalFilter ?? ""}
        onChange={(event) => table.setGlobalFilter(event.target.value)}
      />
    </div>
  );
}

/** One column's values as tabs with counts, plus All. A native radio group, so arrow keys move between them. */
export function FilterTabs({
  column: id,
  legend,
  values,
}: {
  column: string;
  legend: string;
  values: string[];
}) {
  const table = useTableContext();
  const name = useId();
  const column = table.getColumn(id);
  // SAFETY: Only FilterTabs and FilterMenu set these filters, always as the string arrays oneOf reads.
  const chosen = (column?.getFilterValue() as string[] | undefined)?.[0] ?? "";
  const rows = table.getCoreRowModel().rows;

  return (
    <fieldset className="flex min-w-0 flex-wrap gap-x-6 border-b border-line px-4">
      <legend className="sr-only">{legend}</legend>
      {["", ...values].map((value) => (
        <label
          key={value}
          className={cn(
            "relative flex min-h-12 cursor-pointer items-center gap-2 text-15 font-semibold text-muted transition-colors duration-150 hover:text-ink has-checked:text-ink has-checked:after:absolute has-checked:after:inset-x-0 has-checked:after:-bottom-px has-checked:after:h-0.5 has-checked:after:bg-ink",
            hiddenControlFocus,
          )}
        >
          <input
            type="radio"
            name={name}
            className="sr-only"
            checked={chosen === value}
            onChange={() => column?.setFilterValue(value ? [value] : undefined)}
          />
          {value || "All"}
          <span className="rounded-sm bg-tint px-1.5 text-13 leading-5 font-normal tabular-nums">
            {value ? rows.filter((row) => row.getValue(id) === value).length : rows.length}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

/** Pick any of a column's values. Dashed until something is chosen, then a Tag with a button to clear it. */
export function FilterMenu({ column: id, label }: { column: string; label: string }) {
  const table = useTableContext();
  const column = table.getColumn(id);
  // SAFETY: Only FilterTabs and FilterMenu set these filters, always as the string arrays oneOf reads.
  const chosen = (column?.getFilterValue() as string[] | undefined) ?? [];

  const values = [
    ...new Set(table.getCoreRowModel().rows.map((row) => String(row.getValue(id)))),
  ].sort();

  const summary = chosen.length > 1 ? `${chosen[0]} +${chosen.length - 1}` : (chosen[0] ?? label);

  const trigger = (
    <Menu.Trigger
      aria-label={`Filter by ${label.toLowerCase()}${chosen.length ? `: ${summary}` : ""}`}
      className={cn(
        "inline-flex min-w-0 cursor-pointer items-center gap-1.5 rounded-sm text-14 font-semibold transition-colors duration-150",
        !chosen.length &&
          "h-9 border border-dashed border-grey-60 px-3 text-muted hover:border-ink hover:text-ink",
      )}
    >
      <span className="max-w-48 truncate">{summary}</span>
      <CaretDown aria-hidden="true" className="size-3.5 shrink-0" />
    </Menu.Trigger>
  );

  return (
    <Menu.Root>
      {chosen.length ? (
        // Chosen, it's a Tag: the menu to change the choice, and a button to clear it
        <Tag
          className="h-9"
          removeLabel={`Clear ${label.toLowerCase()} filter`}
          onRemove={() => column?.setFilterValue(undefined)}
        >
          {trigger}
        </Tag>
      ) : (
        trigger
      )}
      <Menu.Content aria-label={`Filter by ${label.toLowerCase()}`} className="min-w-56">
        {values.map((value) => (
          <Menu.CheckboxItem
            key={value}
            checked={chosen.includes(value)}
            onCheckedChange={(on) =>
              column?.setFilterValue(
                on ? [...chosen, value] : chosen.filter((item) => item !== value),
              )
            }
            detail={table.getCoreRowModel().rows.filter((row) => row.getValue(id) === value).length}
          >
            {value}
          </Menu.CheckboxItem>
        ))}
      </Menu.Content>
    </Menu.Root>
  );
}

/** Show or hide the columns that allow it. Hidden while narrow, where secondary columns fold away anyway. */
export function ColumnsMenu() {
  const table = useTableContext();

  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <Button icon={<Columns />} className="ms-auto @max-3xl:hidden">
            Columns
          </Button>
        }
      />
      <Menu.Content aria-label="Columns" align="end">
        {table
          .getAllLeafColumns()
          .filter((column) => column.getCanHide())
          .map((column) => (
            <Menu.CheckboxItem
              key={column.id}
              checked={column.getIsVisible()}
              onCheckedChange={(visible) => column.toggleVisibility(visible)}
            >
              {/* oxlint-disable-next-line anti-slop/no-runtime-typeof -- A column header is a label or a render function; only a label can name a menu row. */}
              {typeof column.columnDef.header === "string" ? column.columnDef.header : column.id}
            </Menu.CheckboxItem>
          ))}
      </Menu.Content>
    </Menu.Root>
  );
}

const sortState = { asc: "ascending", desc: "descending" } as const;

/** The current page of rows, with loading, empty and no-match states in place of rows. */
export function DataTable({
  caption,
  loading = false,
  empty,
}: {
  caption: string;
  loading?: boolean;
  empty: Pick<EmptyStateProps, "title" | "description" | "actions">;
}) {
  const table = useTableContext();
  const rows = table.getRowModel().rows;
  const columns = table.getVisibleLeafColumns();
  const filters = useTableFilters();

  return (
    <div role="region" aria-label={caption} tabIndex={0} className="overflow-x-auto">
      <table aria-busy={loading} className="w-full border-collapse text-start text-14">
        <caption className="sr-only">{caption}</caption>
        <thead className="text-12 text-muted">
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map((h) => (
                <table.AppHeader header={h} key={h.id}>
                  {(header) => {
                    const sorted = header.column.getIsSorted();

                    return (
                      <th
                        scope="col"
                        aria-sort={
                          header.column.getCanSort()
                            ? sorted
                              ? sortState[sorted]
                              : "none"
                            : undefined
                        }
                        className={cn(
                          "px-4 py-1.5 text-start font-semibold whitespace-nowrap",
                          header.column.columnDef.meta?.secondary && secondary,
                        )}
                      >
                        {!header.isPlaceholder && <header.SortButton />}
                      </th>
                    );
                  }}
                </table.AppHeader>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: 6 }, (_, row) => (
              <tr key={row} className="border-t border-line">
                {columns.map((column, index) => (
                  <td
                    key={column.id}
                    className={cn("px-4 py-4", column.columnDef.meta?.secondary && secondary)}
                  >
                    <span
                      className={cn(
                        "block h-3 rounded-sm bg-grey-20 motion-safe:animate-pulse",
                        index ? "w-16" : "w-2/3 min-w-40",
                      )}
                    />
                  </td>
                ))}
              </tr>
            ))
          ) : rows.length === 0 ? (
            <tr className="border-t border-line">
              <td colSpan={columns.length}>
                {filters.filtered ? (
                  <EmptyState
                    kind="not-found"
                    title="Nothing matches these filters"
                    actions={
                      <Button variant="secondary" onClick={filters.clear}>
                        Clear filters
                      </Button>
                    }
                  />
                ) : (
                  <EmptyState {...empty} />
                )}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={row.id}
                className="border-t border-line transition-colors duration-150 hover:bg-tint"
              >
                {row.getVisibleCells().map((c) => (
                  <table.AppCell cell={c} key={c.id}>
                    {(cell) => (
                      <td
                        className={cn(
                          "px-4 py-3.5 align-middle",
                          cell.column.columnDef.meta?.secondary && secondary,
                        )}
                      >
                        <cell.FlexRender />
                      </td>
                    )}
                  </table.AppCell>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

const pageSizes = [25, 50, 100];

/** First, last and the pages around the current one, with gaps between. */
function pageWindow(current: number, count: number) {
  const pages = [...new Set([0, current - 1, current, current + 1, count - 1])]
    .filter((page) => page >= 0 && page < count)
    .sort((a, b) => a - b);

  return pages.flatMap((page, index) =>
    index > 0 && page - pages[index - 1]! > 1 ? ["gap" as const, page] : [page],
  );
}

/** "1–25 of 97 services", the page size and numbered pages. `name` is the row noun, singular and plural. */
export function Pagination({ name }: { name: [string, string] }) {
  const table = useTableContext();
  const { pageIndex, pageSize } = table.state.pagination;
  const total = table.getRowCount();
  const pages = table.getPageCount();

  if (total === 0) return null;
  const first = pageIndex * pageSize + 1;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-line px-4 py-3 text-14 text-muted">
      <p aria-live="polite" className="tabular-nums">
        {first}–{Math.min(total, first + pageSize - 1)} of {total} {total === 1 ? name[0] : name[1]}
      </p>
      {total > pageSizes[0]! && (
        <NativeSelect
          size="sm"
          aria-label="Rows per page"
          value={pageSize}
          onChange={(event) => table.setPageSize(Number(event.target.value))}
        >
          {pageSizes.map((size) => (
            <option key={size} value={size}>
              {size} per page
            </option>
          ))}
        </NativeSelect>
      )}
      {pages > 1 && (
        <nav aria-label="Pages" className="ms-auto flex items-center gap-1">
          <Button
            icon={<CaretLeft />}
            aria-label="Previous page"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
          />
          {pageWindow(pageIndex, pages).map((page, index) =>
            page === "gap" ? (
              <span key={`gap-${index}`} aria-hidden="true" className="px-1">
                …
              </span>
            ) : (
              <Button
                key={page}
                aria-label={`Page ${page + 1}`}
                aria-current={page === pageIndex ? "page" : undefined}
                className="min-w-8 tabular-nums"
                onClick={() => table.setPageIndex(page)}
              >
                {page + 1}
              </Button>
            ),
          )}
          <Button
            icon={<CaretRight />}
            aria-label="Next page"
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
          />
        </nav>
      )}
    </div>
  );
}
