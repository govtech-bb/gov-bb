import type { ReactNode } from "react";
import { cn } from "./cn";

export type DataTableColumn<T> = {
  key: string;
  header: string;
  /** Render the cell for a given row. */
  cell: (row: T) => ReactNode;
  /** Right-align numeric/code columns; also applies tabular-nums. */
  numeric?: boolean;
  /** Tailwind width hint, e.g. 'w-[180px]'. */
  width?: string;
  /** Visually hidden header, for an actions column. */
  hideHeader?: boolean;
};

type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty: ReactNode;
  /** Caption shown above the table, e.g. "5 records". */
  caption?: ReactNode;
  /** Drop the outer border so the table can sit inside a larger card. */
  bare?: boolean;
  /** Extra attributes for a row, e.g. a test id. */
  rowProps?: (row: T) => Record<string, string>;
  "data-testid"?: string;
};

/*
 * case-management's DataTable, without its sortable headers: those are
 * links that rebuild the page's query string, and nothing here sorts.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty,
  caption,
  bare,
  rowProps,
  "data-testid": testId,
}: DataTableProps<T>) {
  return (
    <div
      className={cn(
        "w-full overflow-x-auto bg-white-00",
        !bare && "border border-grey-00",
      )}
    >
      {caption && (
        <div className="px-s py-xs border-b border-grey-00 text-caption text-mid-grey-00">
          {caption}
        </div>
      )}
      {rows.length === 0 ? (
        empty
      ) : (
        <table className="w-full border-collapse" data-testid={testId}>
          <thead>
            <tr className="border-b border-grey-00 bg-blue-10/40">
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={cn(
                    "text-left text-caption-sm font-bold text-mid-grey-00 " +
                      "uppercase tracking-[0.08em] px-s py-xs whitespace-nowrap",
                    col.numeric && "text-right tabular-nums",
                    col.width,
                  )}
                >
                  {col.hideHeader ? (
                    <span className="sr-only">{col.header}</span>
                  ) : (
                    col.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                {...rowProps?.(row)}
                className="border-b border-grey-00 last:border-b-0 hover:bg-blue-10/30 transition-colors"
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      "px-s py-xs text-caption align-middle",
                      col.numeric && "text-right tabular-nums",
                    )}
                  >
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
