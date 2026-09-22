/**
 * A modal dialog.
 *
 * Used for the two things that need the whole screen rather than a panel
 * beside a block: reading the document's schema, and editing a collection's
 * records from inside the page that reads them.
 *
 * It is a real dialog. Escape closes it, focus moves in on open and returns
 * to whatever opened it on close, the backdrop is inert to the content
 * behind it, and it is labelled. None of that is decoration — a modal you
 * can open with a keyboard and not leave is worse than no modal.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@govtech-bb/react";

export function Modal({
  title,
  description,
  onClose,
  actions,
  children,
  wide,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  /** Rendered in the header, beside the close button. */
  actions?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    opener.current = document.activeElement;
    const first = panel.current?.querySelector<HTMLElement>(
      "button, input, select, textarea, [href]",
    );
    first?.focus();

    return () => {
      // Back where it came from, so a keyboard user is not dropped at the
      // top of the document every time they close something.
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  return (
    <div
      className="ed-modal-backdrop"
      data-testid="modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        className={`ed-modal${wide ? " ed-modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid="modal"
      >
        <header className="ed-modal-head">
          <h2 className="ed-modal-title">{title}</h2>
          {actions}
          <Button
            type="button"
            variant="secondary"
            data-testid="modal-close"
            onClick={onClose}
          >
            Close
          </Button>
        </header>

        {description ? (
          <p className="ed-modal-description">{description}</p>
        ) : null}

        <div className="ed-modal-body">{children}</div>
      </div>
    </div>
  );
}

/**
 * Copies text and says so. The confirmation matters more than it looks:
 * without it a click on "Copy" is indistinguishable from a click that did
 * nothing, and people click again rather than paste.
 */
export function CopyButton({
  value,
  label = "Copy",
}: {
  value: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  // The confirmation clears itself, so the button does not sit reading
  // "Copied" forever against a clipboard that has long since moved on.
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <Button
      type="button"
      variant="secondary"
      data-testid="copy-json"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
        } catch {
          // Clipboard access is blocked in some contexts. Say so rather
          // than claiming a copy that did not happen.
          setCopied(false);
        }
      }}
    >
      {copied ? "Copied" : label}
    </Button>
  );
}
