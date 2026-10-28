import type { ReactNode } from "react";
import { Banner } from "./banner";
import { Button } from "./button";
import { Dialog } from "./dialog";
import { useLatched } from "./use-latched";

type ConfirmDialogProps = {
  open: boolean;
  /** Closes it, from Cancel or Escape. Not while the action is pending: it can't be called back. */
  onOpenChange: (open: boolean) => void;
  /** The question, such as “Delete this page?” */
  title: string;
  /** What happens, in plain words: what's lost, and what's kept. */
  description: ReactNode;
  /** The verb on the button that does it, such as “Delete page”. */
  confirmLabel: string;
  /** Wait for a separate operation without preventing cancellation of this question. */
  confirmDisabled?: boolean;
  /** The button's words while the action works, such as “Deleting page…”. */
  pendingLabel?: string;
  pending?: boolean;
  /** Why the action failed. The dialog stays open, so the author can try again or cancel. */
  error?: ReactNode;
  /** Red for an action that loses work, teal for any other. */
  variant?: "danger" | "accent";
  /** Where the focus goes once it closes, when the button that opened it has gone. */
  finalFocus?: Parameters<typeof Dialog.Content>[0]["finalFocus"];
  onConfirm: () => void;
};

/**
 * A question to answer before an action that can't be undone: an alert dialog, which a
 * click outside doesn't close. Its button names the action, and stays pressed while it works; an error shows in the
 * dialog. Cancel comes first, so it has the focus when the dialog opens.
 */
export function ConfirmDialog(props: ConfirmDialogProps) {
  const { open, onOpenChange, finalFocus, onConfirm } = props;

  // Closing, it keeps saying what it said open, so an answer that changes what's behind it, such as leaving without
  // saving, doesn't change its words as it fades away
  const {
    title,
    description,
    confirmLabel,
    confirmDisabled = false,
    pendingLabel,
    pending = false,
    error,
    variant = "danger",
  } = useLatched(open ? props : null) ?? props;

  return (
    <Dialog.Root role="alertdialog" open={open} onOpenChange={onOpenChange}>
      <Dialog.Content size="sm" pending={pending} finalFocus={finalFocus}>
        <Dialog.Header>
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.Description>{description}</Dialog.Description>
        </Dialog.Header>
        {error && (
          <Dialog.Body>
            <Banner tone="error">{error}</Banner>
          </Dialog.Body>
        )}
        <Dialog.Actions>
          <Dialog.Cancel />
          <Button
            size="md"
            variant={variant}
            pending={pending}
            pendingLabel={pendingLabel}
            disabled={confirmDisabled}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </Dialog.Actions>
      </Dialog.Content>
    </Dialog.Root>
  );
}
