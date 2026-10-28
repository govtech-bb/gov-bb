import { MagnifyingGlass, Tray, WarningCircle } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { cn } from "../cn";

// Each kind has an icon of its own, so a failure can't pass for an empty list: its warning is the error red where the
// others are grey, and it is read out at once
const kinds = {
  empty: { icon: <Tray />, tint: "text-muted" },
  "not-found": { icon: <MagnifyingGlass />, tint: "text-muted" },
  failed: { icon: <WarningCircle />, tint: "text-error" },
};

const sizes = {
  // A screen's whole content, such as a missing document: its title is the screen's heading
  page: {
    frame: "mx-auto w-full max-w-160 px-6 py-12",
    icon: "mb-4 [&>svg]:size-10",
    title: "text-28 font-semibold",
    description: "mt-2 text-16 text-muted",
    actions: "mt-6",
  },
  // Centred in a table, a card or a dialog
  section: {
    frame: "flex flex-col items-center px-4 py-16 text-center",
    icon: "mb-3 [&>svg]:size-8",
    title: "text-16 font-semibold",
    description: "mx-auto mt-1 max-w-120 text-14 text-balance text-muted",
    actions: "mt-4 justify-center",
  },
  // A line in a list or a panel, its icon before the words
  inline: {
    frame: "flex gap-2 text-14 text-muted",
    icon: "mt-0.5 [&>svg]:size-4",
    title: "",
    description: "mt-0.5",
    actions: "mt-2",
  },
};

export type EmptyStateProps = {
  /** Nothing here yet; nothing found where the author looked; or it couldn't load. */
  kind?: keyof typeof kinds;
  size?: keyof typeof sizes;
  /** In place of the kind's own icon, such as one for what the list would hold. */
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /**
   * What the author can do about it: add the first one, clear the filters, try again. Grey (secondary) when the
   * screen's header already holds that action in teal, so a screen has one main action.
   */
  actions?: ReactNode;
  className?: string;
};

/**
 * What shows where content would be when there is none: an icon, a title, a description and the
 * actions that lead on. One look for an empty list, a search that finds nothing and a load that failed, at the size
 * of what it stands in for: a screen, a part of one, or a line.
 */
export function EmptyState({
  kind = "empty",
  size = "section",
  icon,
  title,
  description,
  actions,
  className,
}: EmptyStateProps) {
  const Title = size === "page" ? "h1" : "p";

  return (
    <div
      role={kind === "failed" ? "alert" : undefined}
      className={cn(sizes[size].frame, className)}
    >
      <span aria-hidden="true" className={cn("flex shrink-0", kinds[kind].tint, sizes[size].icon)}>
        {icon ?? kinds[kind].icon}
      </span>
      <div className="min-w-0">
        <Title className={sizes[size].title}>{title}</Title>
        {description && <div className={sizes[size].description}>{description}</div>}
        {actions && (
          <div className={cn("flex flex-wrap gap-2", sizes[size].actions)}>{actions}</div>
        )}
      </div>
    </div>
  );
}
