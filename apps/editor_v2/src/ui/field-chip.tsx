import type { ReactNode } from "react";
import { cn } from "../cn";

/** Inline answer-reference styling for editor-created DOM nodes; wraps with surrounding text. */
export const fieldChip =
  "rounded-sm bg-interactive-subtle px-1 text-interactive box-decoration-clone";

/** Answer reference for formulas and rules. Truncates long field names instead of wrapping. */
export function FieldChip({
  icon,
  className,
  children,
}: {
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        fieldChip,
        "inline-flex max-w-full items-center gap-1 align-middle whitespace-nowrap [&>svg]:size-3.5 [&>svg]:shrink-0",
        className,
      )}
    >
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}
