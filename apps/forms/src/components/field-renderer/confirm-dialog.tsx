import { Button } from "@govtech-bb/react";
import { JSX, ReactNode, useEffect, useId, useRef } from "react";

/**
 * A modal question with two explicit answers, for a change that throws the
 * applicant's work away. Built on the native `<dialog>` in modal mode, which
 * traps focus and makes the page behind it inert. It cannot be dismissed by
 * accident: Escape is ignored and there is no click-outside — only the two
 * buttons close it. The dialog itself takes focus, not a button: the keystroke
 * that opened it (a space or Enter typed in a field) would otherwise land on
 * the focused button on key-up and answer it unseen.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}): JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null);
  const answered = useRef(false);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      // jsdom has no showModal; the attribute is enough to render it there.
      if (typeof element.showModal === "function") element.showModal();
      else element.setAttribute("open", "");
      element.focus();
    } else if (!open && element.open) {
      if (typeof element.close === "function") element.close();
      else element.removeAttribute("open");
    }
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className="confirm-dialog"
      tabIndex={-1}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      // Escape fires `cancel`; ignore it so only an answer closes the dialog.
      onCancel={(event) => event.preventDefault()}
      // Chrome still force-closes a modal on a repeated Escape. Closed without
      // an answer, take the safe one: keep what the applicant has.
      onClose={() => {
        if (!answered.current) onCancel();
      }}
    >
      <h2 id={titleId} className="govbb-text-h3">
        {title}
      </h2>
      <div id={bodyId}>{children}</div>
      <div className="confirm-dialog__actions">
        <Button
          type="button"
          onClick={() => {
            answered.current = true;
            onCancel();
          }}
        >
          {cancelLabel}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            answered.current = true;
            onConfirm();
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
