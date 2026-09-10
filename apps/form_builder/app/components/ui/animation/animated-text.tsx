import type { CSSProperties, ReactNode } from "react";
import { cn } from "../utils/cn";
/** Reserves the heavier label's width so an emphasized state cannot move its neighbours. */
export function AnimatedText({
  children,
  active,
  className,
}: {
  children: ReactNode;
  active?: boolean;
  className?: string;
}) {
  // Rich labels can contain controls or IDs; only duplicate plain text.
  if (typeof children !== "string" && typeof children !== "number")
    return children;
  return (
    <span
      className={cn("ui-text", className)}
      style={
        active === undefined
          ? undefined
          : ({
              "--ui-text-weight": active
                ? '"wght" 550, "opsz" 18'
                : '"wght" 400, "opsz" 14',
            } as CSSProperties)
      }
    >
      <span aria-hidden="true" className="ui-text-ghost">
        {children}
      </span>
      <span className="ui-text-label">{children}</span>
    </span>
  );
}
