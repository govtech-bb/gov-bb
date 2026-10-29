import type { ReactNode } from "react";

/**
 * A screen's heading, such as a list's: its title, a line on what the screen is for in the lead's 16/24, as an empty
 * screen's has, and its main action at the end, which wraps under the title on a narrow screen.
 */
export function ScreenHeader({
  title,
  lead,
  action,
}: {
  title: ReactNode;
  lead?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="text-28 font-semibold">{title}</h1>
        {lead && <p className="mt-2 text-16 text-muted">{lead}</p>}
      </div>
      {action}
    </div>
  );
}
