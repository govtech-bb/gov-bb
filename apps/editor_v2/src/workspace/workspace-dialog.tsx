import type { ReactNode } from "react";
import { Dialog } from "../ui/dialog";
import { useLatched } from "../ui/use-latched";

/**
 * A workspace task: a title, what the task does, its fields or what it shows, and its buttons, the one that finishes
 * the task last. With onSubmit the fields and buttons are a form, so Enter in a field sends it. It stays on the page
 * once closed, so it fades away rather than vanishing: keep it rendered, with what it showed, and drive `open`.
 */
export function WorkspaceDialog({
  open,
  title,
  description,
  body,
  footer,
  onSubmit,
  pending = false,
  close,
}: {
  open: boolean;
  title: string;
  description: string;
  /** The task's fields, or what it shows. */
  body: ReactNode;
  /** The task's buttons. */
  footer: ReactNode;
  onSubmit?: () => void;
  /**
   * The task is under way, such as a save: Esc, a click outside and the close button wait for its answer, which still
   * needs the dialog, as does what was typed. Disable Cancel in `footer` too.
   */
  pending?: boolean;
  close: () => void;
}) {
  // Closing, it shows what it showed open, so the answer that closed it, such as the service made, doesn't turn its
  // buttons back as it fades away
  const shown = useLatched(open ? { body, footer } : null) ?? { body, footer };

  const task = (
    <>
      <Dialog.Body>{shown.body}</Dialog.Body>
      <Dialog.Actions>{shown.footer}</Dialog.Actions>
    </>
  );

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <Dialog.Content pending={pending} closeLabel={`Close ${title.toLowerCase()}`}>
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
