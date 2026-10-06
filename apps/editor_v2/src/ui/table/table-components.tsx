import { Menu } from "@base-ui/react/menu";
import { CaretLeft, CaretRight, Check, Columns, MagnifyingGlass } from "@phosphor-icons/react";
import { cn } from "../../cn";
import { Button } from "../button";
import { compactInput, settingsInput } from "../input";
import { check, list, option, popup } from "../select";
import { useTableContext } from "./hook";

/** Search, a live result count and the column chooser. `name` is the row noun, singular and plural. */
export function Toolbar({ searchLabel, name }: { searchLabel: string; name: [string, string] }) {
  const table = useTableContext();
  const total = table.getCoreRowModel().rows.length;
  const shown = table.getFilteredRowModel().rows.length;
  const noun = (count: number) => `${count} ${count === 1 ? name[0] : name[1]}`;

  return (
    <div className="mb-3 flex flex-wrap items-center gap-3">
      <div className="relative min-w-60 flex-1">
        <MagnifyingGlass
          aria-hidden="true"
          className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted"
        />
        <input
          type="search"
          aria-label={searchLabel}
          placeholder={searchLabel}
          className={cn(settingsInput, "ps-8")}
          value={table.state.globalFilter ?? ""}
          onChange={(event) => table.setGlobalFilter(event.target.value)}
        />
      </div>
      <p aria-live="polite" className="text-14 text-muted">
        {shown === total ? noun(total) : `${shown} of ${noun(total)}`}
      </p>
      <Menu.Root>
        <Menu.Trigger render={<Button icon={<Columns />}>Columns</Button>} />
        <Menu.Portal>
          <Menu.Positioner sideOffset={6} align="end" className="z-50 outline-none">
            <Menu.Popup className={cn(popup, "min-w-48")}>
              <div className={list}>
                {table
                  .getAllLeafColumns()
                  .filter((column) => column.getCanHide())
                  .map((column) => (
                    <Menu.CheckboxItem
                      key={column.id}
                      checked={column.getIsVisible()}
                      onCheckedChange={(visible) => column.toggleVisibility(visible)}
                      className={option}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {/* oxlint-disable-next-line anti-slop/no-runtime-typeof -- A column header is a label or a render function; only a label can name a menu row. */}
                        {typeof column.columnDef.header === "string"
                          ? column.columnDef.header
                          : column.id}
                      </span>
                      <Menu.CheckboxItemIndicator className={check}>
                        <Check />
                      </Menu.CheckboxItemIndicator>
                    </Menu.CheckboxItem>
                  ))}
              </div>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </div>
  );
}

const sortState = { asc: "ascending", desc: "descending" } as const;

/** The current page of rows. `empty` shows when there are no rows at all. */
export function DataTable({ caption, empty }: { caption: string; empty: string }) {
  const table = useTableContext();
  const rows = table.getRowModel().rows;
  const search: string = table.state.globalFilter ?? "";

  return (
    <div
      role="region"
      aria-label={caption}
      tabIndex={0}
      className="overflow-x-auto rounded-sm border border-line bg-white focus-visible:outline-2 focus-visible:outline-focus"
    >
      <table className="w-full border-collapse text-start text-14">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-tint text-13 text-muted">
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
                        className="px-4 py-2.5 text-start font-semibold whitespace-nowrap"
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
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={table.getVisibleLeafColumns().length}
                className="px-4 py-10 text-center text-muted"
              >
                {search ? (
                  <>
                    Nothing matches “{search}”.{" "}
                    <Button onClick={() => table.resetGlobalFilter()}>Clear search</Button>
                  </>
                ) : (
                  empty
                )}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id} className="border-t border-line hover:bg-hover">
                {row.getVisibleCells().map((c) => (
                  <table.AppCell cell={c} key={c.id}>
                    {(cell) => (
                      <td className="px-4 py-3 align-top">
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

/** "1–25 of 82", then page size and paging once there is more than one small page. */
export function Pagination() {
  const table = useTableContext();
  const { pageIndex, pageSize } = table.state.pagination;
  const total = table.getRowCount();

  if (total === 0) return null;
  const first = pageIndex * pageSize + 1;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 text-14 text-muted">
      <span>
        {first}–{Math.min(total, first + pageSize - 1)} of {total}
      </span>
      {total > pageSizes[0]! && (
        <>
          <label className="ms-auto flex items-center gap-2">
            Per page
            <select
              className={cn(compactInput, "w-auto pe-7")}
              value={pageSize}
              onChange={(event) => table.setPageSize(Number(event.target.value))}
            >
              {pageSizes.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <Button
            icon={<CaretLeft />}
            aria-label="Previous page"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
          />
          <Button
            icon={<CaretRight />}
            aria-label="Next page"
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
          />
        </>
      )}
    </div>
  );
}
