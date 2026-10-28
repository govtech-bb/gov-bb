import type { ReactNode } from "react";
import { Dialog } from "./dialog";
import { useLatched } from "./use-latched";

type FormDialogProps = {
  open: boolean;
  /** Closes it: Cancel, Esc, a click outside or its close button. Not while it's pending. */
  onOpenChange: (open: boolean) => void;
  title: string;
  /** What the task does. */
  description: ReactNode;
  /** Sends the form, from its submit button or from Enter in a field. */
  onSubmit: () => void;
  /**
   * The task is under way, such as a save: Cancel, Esc, a click outside and the close button wait for its answer, which
   * still needs the dialog, as does what was typed.
   */
  pending?: boolean;
  /**
   * The buttons after Cancel, the one that finishes the task last: a submit Button, which shows the work with `pending`
   * and `pendingLabel`, or what stands in for it, such as loading someone else's newer version.
   */
  actions: ReactNode;
  /** Its fields, 16px apart, and what came of sending them. */
  children: ReactNode;
};

/**
 * A task in a dialog, such as creating a service: its title, what it does, its fields, then Cancel and the button that
 * finishes it. Enter in a field sends it. It stays on the page once closed, so it fades away showing what it showed
 * open: keep it rendered and drive `open`.
 */
export function FormDialog(props: FormDialogProps) {
  const { open, onOpenChange, onSubmit } = props;

  // Closing, it shows what it showed open, so the answer that closed it, such as the service made, doesn't turn its
  // buttons back as it fades away
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
