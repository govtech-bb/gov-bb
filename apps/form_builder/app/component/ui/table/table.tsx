import { forwardRef } from "react";
import { cn } from "../utils";
import { Checkbox, type CheckboxChangeEventDetails } from "../checkbox";
/** Table layout and row variant definitions mapping names to their Tailwind classes. */
const tableStyles = {
  layout: {
    auto: "",
    fixed: "table-fixed",
  },
  variant: {
    default:
      "even:bg-ui-canvas [--ui-table-row-bg:var(--ui-base)] even:[--ui-table-row-bg:var(--ui-canvas)]",
    selected: "bg-ui-tint [--ui-table-row-bg:var(--ui-tint)]",
  },
  sticky: {
    left: "sticky left-0",
    right: "sticky right-0",
  },
} as const;
export type TableStickyColumn = keyof typeof tableStyles.sticky;
const stickyColumnClasses = (
  side: TableStickyColumn,
  /** "head" renders at z-2, "cell" at z-1 */
  element: "head" | "cell",
) => {
  const base = tableStyles.sticky[side] ?? tableStyles.sticky["left"];
  const z = element === "head" ? "z-2" : "z-1";
  const fadePosition = side === "right" ? "before:-left-6" : "before:-right-6";
  const fadeBase =
    "before:pointer-events-none before:absolute before:inset-y-0 before:w-6";
  if (element === "cell") {
    // Body cells match their row, including striped and selected backgrounds
    const fade =
      side === "right"
        ? "before:bg-gradient-to-r before:from-transparent before:to-(--ui-table-row-bg)"
        : "before:bg-gradient-to-l before:from-transparent before:to-(--ui-table-row-bg)";
    return cn(base, z, "bg-(--ui-table-row-bg)", fadeBase, fadePosition, fade);
  }
  // Header cells: use ui-surface by default, ui-surface when in compact header
  // The compact header applies a data attribute we can target with :has()
  const bg = "bg-ui-base group-data-[compact]/header:bg-ui-base";
  const fade =
    side === "right"
      ? "before:bg-gradient-to-r before:from-transparent before:to-ui-base group-data-[compact]/header:before:to-ui-base"
      : "before:bg-gradient-to-l before:from-transparent before:to-ui-base group-data-[compact]/header:before:to-ui-base";
  return cn(base, z, bg, fadeBase, fadePosition, fade);
};
export type TableRowVariant = keyof typeof tableStyles.variant;
export type TableLayout = keyof typeof tableStyles.layout;
const TableRoot = forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement> & {
    /**
     * Table layout algorithm.
     * - `"auto"` — columns resize based on content
     * - `"fixed"` — equal-width columns, controlled via `<colgroup>`
     * @default "auto"
     */
    layout?: TableLayout;
  }
>(({ layout = "auto", ...props }, ref) => {
  const className = cn(
    "isolate w-full",
    tableStyles.layout[layout] ?? tableStyles.layout["auto"],
    "[&_td]:p-3", // Cell padding
    "[&_th]:border-b [&_th]:border-ui-tint [&_th]:p-3 [&_th]:text-base [&_th]:font-semibold", // Header styles
    "[&_th]:bg-ui-base", // Header background color
    "text-left text-base text-ui-default",
    props.className,
  );
  return <table ref={ref} {...props} className={className} />;
});
const TableHeader = forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement> & {
    variant?: "default" | "compact";
    /**
     * Make the header row stick to the top of the scroll container.
     * Requires the table's parent to have a constrained height with
     * `overflow-y: auto`.
     */
    sticky?: boolean;
  }
>(({ variant = "default", sticky, ...props }, ref) => {
  const isCompact = variant === "compact";
  const className = cn(
    "group/header",
    isCompact && "text-xs text-ui-default [&_th]:bg-ui-base [&_th]:py-2",
    sticky && "[&_th]:sticky [&_th]:top-0 [&_th]:z-1",
    props.className,
  );
  return (
    <thead
      ref={ref}
      {...props}
      className={className}
      {...(isCompact && { "data-compact": "" })}
    />
  );
});
const TableHead = forwardRef<
  HTMLTableCellElement,
  React.HTMLAttributes<HTMLTableCellElement> & {
    sticky?: TableStickyColumn;
  }
>(({ sticky, ...props }, ref) => {
  const className = cn(
    "group relative",
    sticky && stickyColumnClasses(sticky, "head"),
    props.className,
  );
  return <th ref={ref} {...props} className={className} />;
});
const TableRow = forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement> & {
    variant?: TableRowVariant;
  }
>(({ variant = "default", ...props }, ref) => {
  const className = cn(
    tableStyles.variant[variant] ?? tableStyles.variant["default"],
    props.className,
  );
  return <tr ref={ref} {...props} className={className} />;
});
const TableBody = forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>((props, ref) => {
  return <tbody ref={ref} {...props} />;
});
const TableCell = forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement> & {
    sticky?: TableStickyColumn;
  }
>(({ sticky, ...props }, ref) => {
  const className = cn(
    sticky && stickyColumnClasses(sticky, "cell"),
    props.className,
  );
  return <td ref={ref} {...props} className={className} />;
});
const TableFooter = forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>((props, ref) => {
  return <tfoot ref={ref} {...props} />;
});
const TableResizeHandle = forwardRef<
  HTMLButtonElement,
  React.HTMLAttributes<HTMLButtonElement>
>((props, ref) => {
  return (
    <button
      ref={ref}
      {...props}
      type="button"
      aria-label="Resize column"
      className={cn(
        "invisible h-full group-hover:visible", // Make the handle invisible by default
        "w-[10px]", // Hitting area
        "flex items-center justify-center", // Center the handle
        "cursor-col-resize touch-none select-none", // Prevent selection and touch events
        "absolute top-0 right-0", // Position the handle
        "m-0 bg-ui-base p-0", // Override the stratus button styles
        "focus-visible:ring-2 focus-visible:ring-ui-brand",
      )}
    >
      <span className="h-5 w-[2px] rounded bg-ui-hairline" />
    </button>
  );
});
/**
 * Special cell that makes the entire cell area a hit target for the checkbox.
 */
const TableCheckCell = forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement> & {
    checked?: boolean;
    indeterminate?: boolean;
    /**
     * Called when the checkbox's checked state changes. The optional second
     * argument exposes event details from the underlying Checkbox, matching
     * the Checkbox component's signature.
     */
    onCheckedChange?: (
      checked: boolean,
      eventDetails?: CheckboxChangeEventDetails,
    ) => void;
    onValueChange?: (checked: boolean) => void;
    label?: string;
    disabled?: boolean;
  }
>(
  (
    {
      checked,
      indeterminate,
      onCheckedChange,
      onValueChange,
      label,
      disabled,
      ...props
    },
    ref,
  ) => {
    return (
      <TableCell
        ref={ref}
        {...props}
        className={cn("w-10 leading-none", props.className)}
      >
        <Checkbox
          checked={checked}
          indeterminate={indeterminate}
          onCheckedChange={(newChecked, eventDetails) => {
            onCheckedChange?.(newChecked, eventDetails);
            onValueChange?.(newChecked);
          }}
          aria-label={label ?? "Select row"}
          disabled={disabled}
          className="relative before:absolute before:-inset-3 before:content-['']"
        />
      </TableCell>
    );
  },
);
const TableCheckHead = forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement> & {
    checked?: boolean;
    indeterminate?: boolean;
    /**
     * Called when the checkbox's checked state changes. The optional second
     * argument exposes event details from the underlying Checkbox, matching
     * the Checkbox component's signature.
     */
    onCheckedChange?: (
      checked: boolean,
      eventDetails?: CheckboxChangeEventDetails,
    ) => void;
    onValueChange?: (checked: boolean) => void;
    label?: string;
    disabled?: boolean;
  }
>(
  (
    {
      checked,
      indeterminate,
      onCheckedChange,
      onValueChange,
      label,
      disabled,
      ...props
    },
    ref,
  ) => {
    return (
      <TableHead
        ref={ref}
        {...props}
        className={cn("w-10 leading-none", props.className)}
      >
        <Checkbox
          checked={checked}
          indeterminate={indeterminate}
          onCheckedChange={(newChecked, eventDetails) => {
            onCheckedChange?.(newChecked, eventDetails);
            onValueChange?.(newChecked);
          }}
          aria-label={label ?? "Select all rows"}
          disabled={disabled}
          className="relative before:absolute before:-inset-3 before:content-['']"
        />
      </TableHead>
    );
  },
);
TableRoot.displayName = "Table";
TableBody.displayName = "Table.Body";
TableHead.displayName = "Table.Head";
TableRow.displayName = "Table.Row";
TableCell.displayName = "Table.Cell";
TableFooter.displayName = "Table.Footer";
TableHeader.displayName = "Table.Header";
TableResizeHandle.displayName = "Table.ResizeHandle";
TableCheckCell.displayName = "Table.CheckCell";
TableCheckHead.displayName = "Table.CheckHead";
export const Table = Object.assign(TableRoot, {
  Header: TableHeader,
  Head: TableHead,
  Row: TableRow,
  Body: TableBody,
  Cell: TableCell,
  CheckCell: TableCheckCell,
  CheckHead: TableCheckHead,
  Footer: TableFooter,
  ResizeHandle: TableResizeHandle,
});
