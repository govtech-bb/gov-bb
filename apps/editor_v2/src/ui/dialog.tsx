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
import { InToolbar } from "./toolbar";

type Role = "dialog" | "alertdialog";

// An alert dialog waits for an answer: it needs its own trigger, and it has no close button
const DialogRole = createContext<Role>("dialog");

// Content shares the pending flag with Root so dismissal handlers can block it.
const DialogPending = createContext<RefObject<boolean>>({ current: false });

// Cancel reads the pending state without subscribing Root to content updates.
const DialogBusy = createContext(false);

type RootProps =
  | (BaseDialog.Root.Props & { role?: "dialog" })
  | (BaseAlertDialog.Root.Props & { role: "alertdialog" });

/** `role="alertdialog"` for a question that must be answered: a click outside doesn't close it. */
function DialogRoot(props: RootProps) {
  const pending = useRef(false);

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

/** Shared overlay. `starting:` also animates dialogs mounted already open. */
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
  /** Blocks dismissal while a request is pending, preserving inputs and the place for its result. */
  pending?: boolean;
  className?: string;
  children: ReactNode;
};

/** Header and Actions stay visible while Body scrolls on short screens. */
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
          {/* Opened from a toolbar, its buttons are its own rather than the toolbar's */}
          <InToolbar value={false}>
            <DialogBusy value={pending}>{children}</DialogBusy>
            {close && role === "dialog" && (
              // Beside the title but last in the tab order, so opening the dialog focuses its first field, not this
              <BaseDialog.Close
                disabled={pending}
                render={
                  <Button icon={<X />} aria-label={closeLabel} className="absolute end-4 top-5.5" />
                }
              />
            )}
          </InToolbar>
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

/** Scrollable fields with enough bottom padding to avoid clipping focus rings. */
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

/** Leaves without doing the task: a ghost button before the main action, which waits while the work is pending. */
function DialogCancel({ children = "Cancel" }: { children?: ReactNode }) {
  const pending = useContext(DialogBusy);

  return <BaseDialog.Close disabled={pending} render={<Button size="md">{children}</Button>} />;
}

/** Composable Dialog and AlertDialog parts. Set pending on Content to block dismissal. */
export const Dialog = {
  Root: DialogRoot,
  Trigger: DialogTrigger,
  Content: DialogContent,
  Header: DialogHeader,
  Title: DialogTitle,
  Description: DialogDescription,
  Body: DialogBody,
  Actions: DialogActions,
  Cancel: DialogCancel,
  Close: BaseDialog.Close,
};
