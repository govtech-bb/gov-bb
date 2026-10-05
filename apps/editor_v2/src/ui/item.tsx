import type { ReactNode } from "react";
import { cn } from "../cn";

/** Shared menu row; callers add horizontal padding. Pointer and keyboard highlighting use the same state. */
export const itemBase =
  "group/item relative mx-1 flex h-8 w-[calc(100%-8px)] cursor-pointer items-center justify-between rounded-sm text-left text-14 leading-4 whitespace-nowrap text-ink outline-none select-none data-highlighted:bg-blue-80 data-highlighted:text-white [&_svg]:min-h-4 [&_svg]:min-w-4 [&_svg]:text-muted data-highlighted:[&_svg]:text-white";

export const item = cn(itemBase, "px-2.5");

export function ItemLabel({
  icon,
  className,
  children,
}: {
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-center overflow-hidden not-last:mr-4 [&>span]:truncate [&>span:not(:first-child)]:ml-2 [&>svg]:size-4",
        className,
      )}
    >
      {icon}
      <span>{children}</span>
    </div>
  );
}

/** A menu's grey section heading. Callers add horizontal padding. */
export const sectionLabel =
  "min-w-0 truncate pt-1.5 pb-2 text-12 leading-3.5 font-semibold text-muted";

/** Right-hand keyboard shortcut or current value in a row. */
export function Shortcut({ children }: { children: ReactNode }) {
  return (
    <div className="flex-1 truncate text-end text-12 leading-4 font-normal text-muted group-data-highlighted/item:text-blue-20">
      {children}
    </div>
  );
}
