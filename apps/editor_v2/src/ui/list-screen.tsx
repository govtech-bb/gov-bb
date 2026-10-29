import type { ReactNode, Ref } from "react";
import { ScreenHeader } from "./screen-header";

/**
 * Shared list layout with a persistent loading announcement and notices above the rows.
 * The card provides the container query boundary for responsive table columns.
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
  /** Notices above the rows. Use the card inset to align them with the table. */
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
