import type { ReactNode } from "react";
import { cn } from "../cn";

/**
 * Classes for a reference to a field's answer, for a node built in DOM code, such as a mention in rich text: teal on
 * its tint, as GovBB draws what can be followed, and wrapping with the words around it.
 */
export const fieldChip =
  "rounded-sm bg-interactive-subtle px-1 text-interactive box-decoration-clone";

/**
 * A reference to a field's answer, in a formula, a rule or a sentence: the field's icon, then its name, which a long
 * one cuts short. The one look for a field's answer wherever it stands in for it.
 */
export function FieldChip({
  icon,
  className,
  children,
}: {
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        fieldChip,
        "inline-flex max-w-full items-center gap-1 align-middle whitespace-nowrap [&>svg]:size-3.5 [&>svg]:shrink-0",
        className,
      )}
    >
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}
