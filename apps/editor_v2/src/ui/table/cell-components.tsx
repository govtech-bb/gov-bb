import type { ReactNode } from "react";
import { cn } from "../../cn";
import { useCellContext } from "./table-hooks";

const dates = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" });

// table-hooks registers these cells and they read its cell context: stated return types keep that cycle inferable

/** An ISO timestamp as its UTC calendar day, e.g. 6 Oct 2026. */
export function DateCell(): ReactNode {
  const value = useCellContext<string>().getValue();

  return (
    <time dateTime={value} className="whitespace-nowrap text-muted tabular-nums">
      {dates.format(new Date(value))}
    </time>
  );
}

/**
 * A row's leading cell: its name, its address in small monospace under it, and, while the table is narrow, the
 * details its folded secondary columns would show. The row decides what each part is, such as a link to open it or
 * plain text; long names and addresses wrap rather than widen the table.
 */
export function NameCell({
  name,
  path,
  details,
  className,
}: {
  /** In the table's semibold, unless the row gives it a weight of its own. */
  name: ReactNode;
  /** Its address, muted and monospace. */
  path: ReactNode;
  /** Shown only while the secondary columns are folded away. */
  details?: ReactNode;
  /** For the cell's box, such as its width beside other content. */
  className?: string;
}): ReactNode {
  return (
    <div className={cn("min-w-0 py-0.5", className)}>
      <div className="text-14 font-semibold">{name}</div>
      <div className="mt-0.5 font-mono text-12 wrap-break-word text-muted">{path}</div>
      {details && (
        <div className="mt-2 hidden flex-wrap items-center gap-x-2 gap-y-1 text-12 text-muted @max-3xl:flex">
          {details}
        </div>
      )}
    </div>
  );
}
