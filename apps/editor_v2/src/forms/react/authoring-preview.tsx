import type { ReactNode } from "react";

export function AuthoringPreview({
  icon,
  title,
  text,
}: {
  icon: ReactNode;
  title: string;
  text?: string;
}) {
  return (
    <div className="rounded-sm bg-grey-10 p-3 text-14 shadow-[inset_0_0_0_1px_var(--color-line)]">
      <div className="mb-2 flex items-center gap-1.5 text-12 font-semibold text-muted [&>svg]:size-3.5 [&>svg]:text-blue-40">
        {icon}
        {title} · not shown on the form
      </div>
      <div className="leading-5">{text}</div>
    </div>
  );
}
