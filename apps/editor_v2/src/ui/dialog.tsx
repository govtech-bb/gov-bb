import { AlertDialog as BaseAlertDialog } from "@base-ui/react/alert-dialog";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { X } from "@phosphor-icons/react";
import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { cn } from "../cn";
import { Button } from "./button";

type Role = "dialog" | "alertdialog";

// An alert dialog waits for an answer: it needs its own trigger, and it has no close button
const DialogRole = createContext<Role>("dialog");

// Whether the content's work is pending, which its Root reads before Esc or a click outside may close it
const DialogPending = createContext<RefObject<boolean>>({ current: false });

type RootProps =
  | (BaseDialog.Root.Props & { role?: "dialog" })
  | (BaseAlertDialog.Root.Props & { role: "alertdialog" });

/** `role="alertdialog"` for a question that must be answered: a click outside doesn't close it. */
function DialogRoot(props: RootProps) {
  const pending = useRef(false);

  // While the work is pending, Esc and a click outside wait for it, as the dialog's buttons do
  const guard =
    <Details extends { cancel: () => void }>(
      onOpenChange?: (open: boolean, details: Details) => void,
    ) =>
    (open: boolean, details: Details) => {
      if (!open && pending.current) details.cancel();
      else onOpenChange?.(open, details);
    };

  if (props.role === "alertdialog") {
    const { role, onOpenChange, ...root } = props;

    return (
      <DialogRole value={role}>
        <DialogPending value={pending}>
          <BaseAlertDialog.Root {...root} onOpenChange={guard(onOpenChange)} />
        </DialogPending>
      </DialogRole>
    );
  }

  const { role = "dialog", onOpenChange, ...root } = props;

  return (
    <DialogRole value={role}>
      <DialogPending value={pending}>
        <BaseDialog.Root {...root} onOpenChange={guard(onOpenChange)} />
      </DialogPending>
    </DialogRole>
  );
}

// Handles tie a trigger to one kind of root, so neither kind is offered here
function DialogTrigger(props: Omit<BaseDialog.Trigger.Props, "handle">) {
  const role = useContext(DialogRole);

  return role === "alertdialog" ? (
    <BaseAlertDialog.Trigger {...props} />
  ) : (
    <BaseDialog.Trigger {...props} />
  );
}

/**
 * What a dialog or a drawer dims the page with. A dialog put on the page already open, which Base UI doesn't animate,
 * fades in from the same start (`starting:`).
 */
export const backdrop =
  "fixed inset-0 z-popup bg-ink/40 transition-opacity duration-(--duration-dialog-in) ease-out-quint starting:opacity-0 data-starting-style:opacity-0 data-ending-style:opacity-0 data-ending-style:duration-(--duration-dialog-out)";

const sizes = {
  // A question and its answers
  sm: "max-w-100",
  // A short form
  md: "max-w-152",
  // Lists and longer forms
  lg: "max-w-190",
  // Source and other work that wants the room
  full: "h-full max-w-300",
};

type ContentProps = Pick<BaseDialog.Popup.Props, "initialFocus" | "finalFocus"> & {
  size?: keyof typeof sizes;
  /** `false` leaves out the close button, for a dialog that can't be left yet. Alert dialogs never have one. */
  close?: boolean;
  /** Names the close button, such as “Close source”. */
  closeLabel?: string;
  /**
   * Its work is under way, such as a save: Esc, a click outside and the close button wait until it's done, so what the
   * work answers still has somewhere to show. Disable its Cancel too.
   */
  pending?: boolean;
  className?: string;
  children: ReactNode;
};

/**
 * The dialog over a dimmed page, centred, scaling up a little as it fades in. Lay it out with Header, Body and
 * Actions: the body scrolls when the screen is short, so the header and the buttons stay in view.
 */
function DialogContent({
  size = "md",
  close = true,
  closeLabel = "Close",
  pending = false,
  initialFocus,
  finalFocus,
  className,
  children,
}: ContentProps) {
  const role = useContext(DialogRole);
  const lock = useContext(DialogPending);

  useLayoutEffect(() => {
    lock.current = pending;
  }, [lock, pending]);

  return (
    <BaseDialog.Portal>
      <BaseDialog.Backdrop className={backdrop} />
      <BaseDialog.Viewport className="fixed inset-0 z-popup grid place-items-center p-4">
        <BaseDialog.Popup
          initialFocus={initialFocus}
          finalFocus={finalFocus}
          className={cn(
            "relative flex max-h-full w-full flex-col overflow-hidden rounded-sm bg-white pb-6 font-sans text-ink shadow-popup outline-none",
            "transition-[opacity,scale] duration-(--duration-dialog-in) ease-out-quint starting:opacity-0 data-starting-style:opacity-0 data-ending-style:opacity-0 data-ending-style:duration-(--duration-dialog-out) motion-safe:starting:scale-96 motion-safe:data-starting-style:scale-96 motion-safe:data-ending-style:scale-96",
            sizes[size],
            className,
          )}
        >
          {children}
          {close && role === "dialog" && (
            // Beside the title but last in the tab order, so opening the dialog focuses its first field, not this
            <BaseDialog.Close
              disabled={pending}
              render={
                <Button icon={<X />} aria-label={closeLabel} className="absolute end-4 top-5.5" />
              }
            />
          )}
        </BaseDialog.Popup>
      </BaseDialog.Viewport>
    </BaseDialog.Portal>
  );
}

function DialogHeader({ children }: { children: ReactNode }) {
  return <div className="shrink-0 px-6 pt-6">{children}</div>;
}

/** Leaves room at its end for the close button. */
function DialogTitle({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <BaseDialog.Title className={cn("pe-8 text-20 font-semibold text-balance", className)}>
      {children}
    </BaseDialog.Title>
  );
}

function DialogDescription({ children }: { children: ReactNode }) {
  return (
    <BaseDialog.Description className="mt-1 text-14 text-pretty text-muted">
      {children}
    </BaseDialog.Description>
  );
}

/**
 * Its fields and messages, stacked 16px apart as the foundations space field from field. Scrolls when the screen is
 * short; its bottom inset keeps a focused field's ring from being cut off at the edge.
 */
function DialogBody({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "-mb-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pt-4 pb-1",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * The dialog's buttons, at its end: put the one that completes the task last. A status beside them, such as
 * "Unapplied changes", goes first with `me-auto`.
 */
function DialogActions({ children }: { children: ReactNode }) {
  return <div className="flex shrink-0 flex-wrap justify-end gap-2 px-6 pt-6">{children}</div>;
}

/** The tool's dialogs, on Base UI's Dialog and AlertDialog: Close is Base UI's own part. */
export const Dialog = {
  Root: DialogRoot,
  Trigger: DialogTrigger,
  Content: DialogContent,
  Header: DialogHeader,
  Title: DialogTitle,
  Description: DialogDescription,
  Body: DialogBody,
  Actions: DialogActions,
  Close: BaseDialog.Close,
};
