import type { ReactNode, Ref } from "react";
import { ScreenHeader } from "./screen-header";

/**
 * A screen that lists things, such as Services or Categories: its ScreenHeader over a card that holds the list. In the
 * card, any filters over the rows; a status line for screen readers, which outlives the table, so a load is announced
 * once; notices, such as a RefreshFailure while what was read before still shows; then the table and its pagination, or why the list
 * couldn't load in their place. The card is a size container, so a table narrower than its columns folds the secondary
 * ones into its first. Inset at the bars' margins, so the title lines up with the header's first control.
 */
export function ListScreen({
  title,
  lead,
  action,
  filters,
  status,
  notices,
  failure,
  ref,
  children,
}: {
  title: ReactNode;
  /** What the screen is for, in a line under its title. */
  lead?: ReactNode;
  /** Its main action, such as Create service. An empty list's own action then repeats it in grey. */
  action?: ReactNode;
  /** Search and filters over the rows. */
  filters?: ReactNode;
  /** For screen readers only, such as “Loading services…” while the list loads; empty otherwise. */
  status?: ReactNode;
  /**
   * Notices over the rows, each with the card's inset: a RefreshFailure while the list on screen is an old one, or why
   * nothing in it can be changed.
   */
  notices?: ReactNode;
  /** Why the list couldn't load at all, such as a LoadFailure, in place of the table and its pagination. */
  failure?: ReactNode;
  /** The card, for finding the controls in its rows. */
  ref?: Ref<HTMLDivElement>;
  /** The table and its pagination. */
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-300 px-4 py-10 sm:px-6">
      <ScreenHeader title={title} lead={lead} action={action} />
      <div
        ref={ref}
        className="@container min-w-0 rounded-sm bg-white shadow-sheet ring-1 ring-grey-40"
      >
        {filters}
        <p role="status" className="sr-only">
          {status}
        </p>
        {notices}
        {failure || children}
      </div>
    </div>
  );
}
