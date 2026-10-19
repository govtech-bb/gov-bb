import type { ReactNode } from "react";
import { Banner } from "./banner";
import { Button } from "./button";
import { Dialog } from "./dialog";

type ConfirmDialogProps = {
  open: boolean;
  /** Closes it, from Cancel or Escape. Not while the action is pending: it can't be called back. */
  onClose: () => void;
  /** The question, such as “Delete this page?” */
  title: string;
  /** What happens, in plain words: what's lost, and what's kept. */
  description: ReactNode;
  /** The verb on the button that does it, such as “Delete page”. */
  confirm: string;
  /** Wait for a separate operation without preventing cancellation of this question. */
  confirmDisabled?: boolean;
  /** The button's words while the action works, such as “Deleting page…”. */
  pendingLabel?: string;
  pending?: boolean;
  /** Why the action failed. The dialog stays open, so the author can try again or cancel. */
  error?: ReactNode;
  /** Red for an action that loses work, teal for any other. */
  tone?: "danger" | "accent";
  /** Where the focus goes once it closes, when the button that opened it has gone. */
  finalFocus?: Parameters<typeof Dialog.Content>[0]["finalFocus"];
  onConfirm: () => void;
};

/**
 * A question to answer before an action that can't be undone: an alert dialog, which a
 * click outside doesn't close. Its button names the action, and stays pressed while it works; an error shows in the
 * dialog. Cancel comes first, so it has the focus when the dialog opens.
 */
export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  confirm,
  confirmDisabled = false,
  pendingLabel,
  pending = false,
  error,
  tone = "danger",
  finalFocus,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog.Root
      role="alertdialog"
      open={open}
      onOpenChange={(next) => {
        if (!next && !pending) onClose();
      }}
    >
      <Dialog.Content size="sm" finalFocus={finalFocus}>
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
          <Button size="md" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="md"
            variant={tone}
            pending={pending}
            disabled={confirmDisabled}
            onClick={onConfirm}
          >
            {pending && pendingLabel ? pendingLabel : confirm}
          </Button>
        </Dialog.Actions>
      </Dialog.Content>
    </Dialog.Root>
  );
}
