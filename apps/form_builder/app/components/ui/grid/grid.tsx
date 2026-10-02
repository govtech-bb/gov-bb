import React from "react";
import { cn } from "../utils/cn";
/** Grid variant and gap definitions mapping layout names to their responsive Tailwind classes. */
const gridStyles = {
  variant: {
    "2up": "grid-cols-1 md:grid-cols-2",
    "side-by-side": "grid-cols-2",
    "2-1": "grid-cols-1 md:grid-cols-[2fr_1fr]",
    "1-2": "grid-cols-1 md:grid-cols-[1fr_2fr]",
    "1-3up": "grid-cols-1 lg:grid-cols-3",
    "3up": "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
    "4up": "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
    "6up": "grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6",
    "1-2-4up": "grid-cols-1 md:grid-cols-2 lg:grid-cols-4",
  },
  gap: {
    none: "gap-0",
    sm: "gap-3",
    base: "gap-2 md:gap-6 lg:gap-8",
    lg: "gap-8",
  },
} as const;
export type GridVariant = keyof typeof gridStyles.variant;
export type GridGap = keyof typeof gridStyles.gap;
export interface GridProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Grid items to render. */
  children?: React.ReactNode;
  /** Additional CSS classes merged via `cn()`. */
  className?: string;
  /** Show dividers between grid items on mobile (only works with `"4up"` variant). */
  mobileDivider?: boolean;
  /**
   * Gap size between grid items.
   * - `"none"` — No gap
   * - `"sm"` — 12px gap
   * - `"base"` — Responsive gap (8px → 24px → 32px)
   * - `"lg"` — 32px gap
   * @default "base"
   */
  gap?: GridGap;
  variant?: GridVariant;
}
/** GridItem component props — a single cell within a Grid. */
export interface GridItemProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Content for this grid cell. */
  children?: React.ReactNode;
  /** Additional CSS classes merged via `cn()`. */
  className?: string;
}
interface GridContextValue {
  variant?: GridVariant;
  gap: GridGap;
  mobileDivider?: boolean;
}
const GridContext = React.createContext<GridContextValue>({
  gap: "base",
});
export function gridVariants({
  variant,
  gap = "base",
}: {
  variant?: GridVariant;
  gap?: GridGap;
} = {}) {
  return cn(
    "grid",
    variant && (gridStyles.variant[variant] ?? gridStyles.variant["2up"]),
    gridStyles.gap[gap] ?? gridStyles.gap["base"],
  );
}
export function gridItemVariants({
  variant,
  mobileDivider,
}: {
  variant?: GridVariant;
  mobileDivider?: boolean;
} = {}) {
  return cn(
    mobileDivider &&
      variant === "4up" &&
      "border-b border-ui-hairline pb-8 md:border-b-0 md:pb-0",
  );
}
export const Grid = React.forwardRef<HTMLDivElement, GridProps>(
  (
    { children, className, mobileDivider, gap = "base", variant, ...props },
    ref,
  ) => {
    return (
      <GridContext.Provider value={{ variant, gap, mobileDivider }}>
        <div
          ref={ref}
          className={cn(gridVariants({ variant, gap }), className)}
          {...props}
        >
          {children}
        </div>
      </GridContext.Provider>
    );
  },
);
Grid.displayName = "Grid";
export const GridItem = React.forwardRef<HTMLDivElement, GridItemProps>(
  ({ children, className, ...props }, ref) => {
    const { variant, mobileDivider } = React.useContext(GridContext);
    return (
      <div
        ref={ref}
        className={cn(gridItemVariants({ variant, mobileDivider }), className)}
        {...props}
      >
        {children}
      </div>
    );
  },
);
GridItem.displayName = "GridItem";
