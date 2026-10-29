import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn";

/**
 * Classes for a caption, for a node built in DOM code: an element holding an svg, then the words. Make it 14px, as
 * the class sizes an svg child.
 */
export const caption =
  "flex h-6 min-w-0 items-center gap-1.5 text-12 leading-4 font-semibold text-muted select-none [&>svg]:size-3.5 [&>svg]:shrink-0 [&>svg]:text-blue-40";

/** Labels editor-only content that is not part of the published form. */
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

/** Groups editor-only controls under a caption that distinguishes them from published form content. */
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
