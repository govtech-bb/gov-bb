import { CaretLeft, CaretRight, MagnifyingGlass } from "@phosphor-icons/react";
import type { MouseEvent, Ref } from "react";
import { cn } from "../../cn";
import { Button } from "../button";
import { EmptyState, type EmptyStateProps } from "../empty-state";
import { Input } from "../input";
import { NativeSelect } from "../native-select";
import { NameCell } from "./cell-components";
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

const sortState = { asc: "ascending", desc: "descending" } as const;

/** A grey bar where words will be, pulsing while motion is welcome. */
function Placeholder({ className }: { className: string }) {
  return (
    <span
      className={cn(
        "inline-block h-2.5 rounded-sm bg-grey-20 align-middle motion-safe:animate-pulse",
        className,
      )}
    />
  );
}

// A click on one of these is the control's, not the row's
const controls = "a, button, input, select, textarea, label";

/**
 * The current page of rows, with loading, empty and no-match states in place of rows. Its columns keep the widths the
 * screen gives them (`meta.width`), the leading column the rest, so loading, sorting, filtering and paging never move
 * them. Loading, placeholder rows stand in the shape of the rows to come, a name and its address leading each, so
 * nothing moves as they arrive; the first says what it's loading, named by its caption. Screen readers hear that from
 * the screen's own status line instead, which outlives the table.
 *
 * With `rowLink`, a row that lights up under the pointer opens like it: a click anywhere on it that isn't on one of its
 * controls follows its first link, which stays the way in for the keyboard and screen readers.
 */
export function DataTable({
  caption,
  loading = false,
  empty,
  marked,
  rowLink = false,
}: {
  caption: string;
  loading?: boolean;
  empty: Pick<EmptyStateProps, "title" | "description" | "actions">;
  /** A row to pick out by its id, such as one that has just moved, so the eye can follow it. */
  marked?: string;
  /** Each row opens with its first link, such as its name's. */
  rowLink?: boolean;
}) {
  const table = useTableContext();
  const rows = table.getRowModel().rows;
  const columns = table.getVisibleLeafColumns();
  const filters = useTableFilters();
  const loadingWords = `Loading ${caption.toLowerCase()}…`;

  // A plain click, not one that ends a selection of the row's words
  const open = (event: MouseEvent<HTMLTableRowElement>) => {
    if (!(event.target instanceof Element) || event.target.closest(controls)) return;

    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    if (document.getSelection()?.toString()) return;
    event.currentTarget.querySelector<HTMLAnchorElement>("a[href]")?.click();
  };

  return (
    <div role="region" aria-label={caption} tabIndex={0} className="overflow-x-auto">
      <table aria-busy={loading} className="w-full table-fixed border-collapse text-start text-14">
        <caption className="sr-only">{caption}</caption>
        <thead className="text-12 text-muted">
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map((h) => (
                <table.AppHeader header={h} key={h.id}>
                  {(header) => {
                    const sorted = header.column.getIsSorted();
                    const meta = header.column.columnDef.meta;

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
                          meta?.width,
                          meta?.align === "end" && "text-end",
                          meta?.secondary && secondary,
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
            Array.from({ length: 6 }, (_, place) => (
              <tr key={place} aria-hidden="true" className="border-t border-line">
                {columns.map((column, index) => (
                  <td
                    key={column.id}
                    className={cn(
                      "px-4 py-3.5 align-middle",
                      column.columnDef.meta?.secondary && secondary,
                    )}
                  >
                    {index ? (
                      <Placeholder className="w-16" />
                    ) : (
                      <NameCell
                        name={
                          place ? (
                            <Placeholder className="h-3 w-2/3" />
                          ) : (
                            <span className="font-normal text-muted">{loadingWords}</span>
                          )
                        }
                        path={<Placeholder className="w-1/3" />}
                        details={
                          <span>
                            <Placeholder className="w-24" />
                          </span>
                        }
                      />
                    )}
                  </td>
                ))}
              </tr>
            ))
          ) : rows.length === 0 ? (
            <tr className="border-t border-line">
              <td colSpan={columns.length}>
                {filters.filtered ? (
                  <EmptyState kind="not-found" title="Nothing matches these filters" />
                ) : (
                  <EmptyState {...empty} />
                )}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={row.id}
                onClick={rowLink ? open : undefined}
                className={cn(
                  "border-t border-line transition-colors",
                  row.id === marked ? "bg-blue-10" : "hover:bg-tint",
                  rowLink && "cursor-pointer",
                )}
              >
                {row.getVisibleCells().map((c) => (
                  <table.AppCell cell={c} key={c.id}>
                    {(cell) => (
                      <td
                        className={cn(
                          "px-4 py-3.5 align-middle",
                          cell.column.columnDef.meta?.align === "end" && "text-end",
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
      {/* Its figures one width, in room for the longest, so the page size beside it stays put from page to page */}
      <p aria-live="polite" className="min-w-44 tabular-nums">
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
