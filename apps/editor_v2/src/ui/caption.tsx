import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn";

/**
 * Classes for a caption, for a node built in DOM code: an element holding an svg, then the words. Make it 14px, as
 * the class sizes an svg child.
 */
export const caption =
  "flex h-6 min-w-0 items-center gap-1.5 text-12 leading-4 font-semibold text-muted select-none [&>svg]:size-3.5 [&>svg]:shrink-0 [&>svg]:text-blue-40";

/**
 * What a part of the canvas the author sees, and people filling in the form don't, is: an icon, then a few words, such
 * as “Preview” over a page's preview.
 */
export function Caption({
  icon,
  className,
  children,
}: {
  icon: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn(caption, className)}>
      {icon}
      {children}
    </div>
  );
}

type AuthorCardProps = Omit<ComponentProps<"div">, "title"> & {
  icon: ReactNode;
  /** What the block is, such as “Calculated fields”. */
  title: string;
};

/**
 * A block only the author sees, such as logic or calculated fields: on the desk's grey rather than the form's white
 * sheet, under a caption that says what it is and that the form won't show it.
 */
export function AuthorCard({ icon, title, className, children, ...props }: AuthorCardProps) {
  return (
    <div
      {...props}
      className={cn("rounded-sm bg-tint p-3 text-14 inset-ring inset-ring-line", className)}
    >
      <Caption icon={icon}>{title} · not shown on the form</Caption>
      {children}
    </div>
  );
}
