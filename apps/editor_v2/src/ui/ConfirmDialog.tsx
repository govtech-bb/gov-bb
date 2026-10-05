import { forwardRef, useRef, type ReactNode } from "react";
import { cn } from "./cn";

const SIZES = {
  default: "w-[min(28rem,calc(100vw-2rem))]",
  wide: "w-[min(46rem,calc(100vw-2rem))]",
} as const;

// Exactly one of the two labelling props: a modal with no accessible name is
// a WCAG failure, and `never` stops a caller supplying both.
type Labelling =
  | { ariaLabel: string; ariaLabelledBy?: never }
  | { ariaLabelledBy: string; ariaLabel?: never };

type ConfirmDialogProps = Labelling & {
  onClose?: () => void;
  children: ReactNode;
  /** Replaces the default `gap-m` of the content column. */
  contentClassName?: string;
  size?: keyof typeof SIZES;
  "data-testid"?: string;
};

/**
 * case-management's modal shell: a native <dialog>, driven by the caller
 * through the forwarded ref (`showModal()` / `close()`). Being native puts
 * it in the top layer, so it stacks correctly over the editor's own modal
 * when a collection is edited from inside a page.
 */
export const ConfirmDialog = forwardRef<HTMLDialogElement, ConfirmDialogProps>(
  function ConfirmDialog(
    {
      ariaLabel,
      ariaLabelledBy,
      onClose,
      children,
      contentClassName = "gap-m",
      size = "default",
      "data-testid": testId,
    },
    ref,
  ) {
    // Dismiss only on a genuine backdrop click — press AND release on the
    // <dialog> itself, so dragging a selection out of a field does not close it.
    const pressedBackdrop = useRef(false);
    return (
      <dialog
        ref={ref}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        data-testid={testId}
        onClose={onClose}
        onMouseDown={(event) => {
          pressedBackdrop.current = event.target === event.currentTarget;
        }}
        onClick={(event) => {
          if (pressedBackdrop.current && event.target === event.currentTarget) {
            event.currentTarget.close();
          }
          pressedBackdrop.current = false;
        }}
        className={cn(
          "m-auto border border-grey-00 bg-white-00 text-black-00 backdrop:bg-black-00/40",
          SIZES[size],
        )}
      >
        {/* Padding on the inner column, so a click inside never dismisses. */}
        <div className={cn("flex flex-col p-l", contentClassName)}>
          {children}
        </div>
      </dialog>
    );
  },
);
