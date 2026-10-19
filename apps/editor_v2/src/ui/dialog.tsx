import { AlertDialog as BaseAlertDialog } from "@base-ui/react/alert-dialog";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { X } from "@phosphor-icons/react";
import { createContext, useContext, type ReactNode } from "react";
import { cn } from "../cn";
import { Button } from "./button";

type Role = "dialog" | "alertdialog";

// An alert dialog waits for an answer: it needs its own trigger, and it has no close button
const DialogRole = createContext<Role>("dialog");

type RootProps =
  | (BaseDialog.Root.Props & { role?: "dialog" })
  | (BaseAlertDialog.Root.Props & { role: "alertdialog" });

/** `role="alertdialog"` for a question that must be answered: a click outside doesn't close it. */
function DialogRoot(props: RootProps) {
  if (props.role === "alertdialog") {
    const { role, ...root } = props;

    return (
      <DialogRole value={role}>
        <BaseAlertDialog.Root {...root} />
      </DialogRole>
    );
  }

  const { role = "dialog", ...root } = props;

  return (
    <DialogRole value={role}>
      <BaseDialog.Root {...root} />
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

/** What a dialog or a drawer dims the page with. */
export const backdrop =
  "fixed inset-0 z-50 bg-ink/40 transition-opacity duration-200 ease-out-quint data-starting-style:opacity-0 data-ending-style:opacity-0 data-ending-style:duration-150";

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
  initialFocus,
  finalFocus,
  className,
  children,
}: ContentProps) {
  const role = useContext(DialogRole);

  return (
    <BaseDialog.Portal>
      <BaseDialog.Backdrop className={backdrop} />
      <BaseDialog.Viewport className="fixed inset-0 z-50 grid place-items-center p-4">
        <BaseDialog.Popup
          initialFocus={initialFocus}
          finalFocus={finalFocus}
          className={cn(
            "relative flex max-h-full w-full flex-col overflow-hidden rounded-sm bg-white pb-6 font-sans text-ink shadow-popup outline-none",
            "transition-[opacity,scale] duration-200 ease-out-quint data-starting-style:opacity-0 data-ending-style:opacity-0 data-ending-style:duration-150 motion-safe:data-starting-style:scale-96 motion-safe:data-ending-style:scale-96",
            sizes[size],
            className,
          )}
        >
          {children}
          {close && role === "dialog" && (
            // Beside the title but last in the tab order, so opening the dialog focuses its first field, not this
            <BaseDialog.Close
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

/** Scrolls when the screen is short. Its bottom inset keeps a focused field's ring from being cut off at the edge. */
function DialogBody({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("-mb-1 min-h-0 flex-1 overflow-y-auto px-6 pt-4 pb-1", className)}>
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
