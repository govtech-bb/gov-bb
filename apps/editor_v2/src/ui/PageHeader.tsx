import type { ReactNode } from "react";

type PageHeaderProps = {
  eyebrow?: ReactNode;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
};

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-s mb-m">
      <div className="flex items-start justify-between gap-m">
        <div className="flex flex-col gap-xxs">
          {eyebrow && (
            <span className="text-caption-sm uppercase tracking-[0.12em] text-mid-grey-00 font-bold">
              {eyebrow}
            </span>
          )}
          <h1 className="text-h3 text-blue-00 font-bold leading-tight">
            {title}
          </h1>
          {description && (
            <p className="text-caption text-mid-grey-00 max-w-2xl leading-snug">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-xs shrink-0">{actions}</div>
        )}
      </div>
    </div>
  );
}

/** A small uppercase section label, as case-management sets them. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-xs text-caption-sm uppercase tracking-[0.12em] text-mid-grey-00 font-bold">
      {children}
    </h2>
  );
}
