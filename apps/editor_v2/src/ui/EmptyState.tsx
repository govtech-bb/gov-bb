import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-s py-l gap-s">
      {/* Three hairlines and one teal accent, as case-management draws it. */}
      <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden>
        <rect x="10" y="14" width="36" height="3" className="fill-blue-10" />
        <rect x="10" y="26" width="36" height="3" className="fill-blue-10" />
        <rect x="10" y="38" width="36" height="3" className="fill-blue-10" />
        <rect x="10" y="14" width="8" height="3" className="fill-teal-100" />
      </svg>
      <div className="flex flex-col gap-xs max-w-md">
        <p className="text-h4 text-blue-00">{title}</p>
        {description && (
          <p className="text-caption text-mid-grey-00">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
