import type { ReactNode } from "react";
import { Dialog } from "./dialog";
import { useLatched } from "./use-latched";

type FormDialogProps = {
  open: boolean;
  /** Closes it: Cancel, Esc, a click outside or its close button. Not while it's pending. */
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  /** Sends the form, from its submit button or from Enter in a field. */
  onSubmit: () => void;
  /** Blocks dismissal until the request finishes, preserving the form and its result. */
  pending?: boolean;
  /** Render the submit action last, after any recovery actions. Cancel is supplied by the dialog. */
  actions: ReactNode;
  /** Its fields, 16px apart, and what came of sending them. */
  children: ReactNode;
};

/**
 * Uses native form submission and blocks dismissal while pending.
 * Keep mounted and control `open` so the closing transition retains the form's last state.
 */
export function FormDialog(props: FormDialogProps) {
  const { open, onOpenChange, onSubmit } = props;

  const {
    title,
    description,
    pending = false,
    actions,
    children,
  } = useLatched(open ? props : null) ?? props;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content pending={pending}>
        <Dialog.Header>
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.Description>{description}</Dialog.Description>
        </Dialog.Header>
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <Dialog.Body>{children}</Dialog.Body>
          <Dialog.Actions>
            <Dialog.Cancel />
            {actions}
          </Dialog.Actions>
        </form>
      </Dialog.Content>
    </Dialog.Root>
  );
}
