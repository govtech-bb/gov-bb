import type { ReactNode } from "react";
import { Dialog } from "../ui/dialog";

/**
 * A workspace task: a title, what the task does, its fields or what it shows, and its buttons, the one that finishes
 * the task last. With onSubmit the fields and buttons are a form, so Enter in a field sends it. Kept on the page with
 * `open` turned off, it fades out instead of vanishing.
 */
export function WorkspaceDialog({
  open = true,
  title,
  description,
  body,
  footer,
  onSubmit,
  close,
  finalFocus,
}: {
  title: string;
  description: string;
  /** The task's fields, or what it shows. */
  body: ReactNode;
  /** The task's buttons. */
  footer: ReactNode;
  onSubmit?: () => void;
  close: () => void;
  open?: boolean;
  /** Where the focus goes once it closes, when the button that opened it isn't the place. */
  finalFocus?: Parameters<typeof Dialog.Content>[0]["finalFocus"];
}) {
  const task = (
    <>
      <Dialog.Body>{body}</Dialog.Body>
      <Dialog.Actions>{footer}</Dialog.Actions>
    </>
  );

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <Dialog.Content closeLabel={`Close ${title.toLowerCase()}`} finalFocus={finalFocus}>
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
