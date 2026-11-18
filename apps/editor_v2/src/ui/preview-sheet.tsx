import type { ReactNode } from "react";
import { cn } from "../cn";
import { govbbOptional } from "./govbb";

/**
 * The page a block's preview is drawn on in the insert dialog: a white sheet on the grey desk, at the form's preview
 * sizes. A picture only, so it is hidden from screen readers and takes no pointer; the dialog says what the block is.
 */
export function PreviewSheet({ children }: { children: ReactNode }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none mt-5 rounded-sm bg-grey-10 p-4 select-none"
    >
      <div className="overflow-hidden rounded-sm bg-white p-5 text-(length:--form-text) shadow-sheet [--form-control:2.75rem] [--form-marker:1.75rem] [--form-text:1rem]">
        {children}
      </div>
    </div>
  );
}

/** A question in a preview, as GovBB sets it: the label, “(optional)” when it is, the hint, then the answer. */
export function PreviewQuestion({
  label,
  hint,
  optional,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  optional?: boolean;
  /** The answer's drawing. */
  children?: ReactNode;
}) {
  return (
    <>
      <div className="leading-[1.5] font-bold">
        {label}
        {optional && <span className={cn(govbbOptional, "ml-1.5")}>(optional)</span>}
      </div>
      {hint && <div className="leading-[1.5] text-muted">{hint}</div>}
      {children && <div className="mt-2">{children}</div>}
    </>
  );
}
