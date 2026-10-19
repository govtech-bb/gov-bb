import type { ReactNode } from "react";
import { Dialog } from "../ui/dialog";

/**
 * A workspace task: a title, what the task does, its fields or what it shows, and its buttons, the one that finishes
 * the task last. With onSubmit the fields and buttons are a form, so Enter in a field sends it.
 */
export function WorkspaceDialog({
  title,
  description,
  body,
  footer,
  onSubmit,
  close,
}: {
  title: string;
  description: string;
  /** The task's fields, or what it shows. */
  body: ReactNode;
  /** The task's buttons. */
  footer: ReactNode;
  onSubmit?: () => void;
  close: () => void;
}) {
  const task = (
    <>
      <Dialog.Body>{body}</Dialog.Body>
      <Dialog.Actions>{footer}</Dialog.Actions>
    </>
  );

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Dialog.Content closeLabel={`Close ${title.toLowerCase()}`}>
        <Dialog.Header>
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.Description>{description}</Dialog.Description>
        </Dialog.Header>
        {onSubmit ? (
          <form
            className="contents"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit();
            }}
          >
            {task}
          </form>
        ) : (
          task
        )}
      </Dialog.Content>
    </Dialog.Root>
  );
}
