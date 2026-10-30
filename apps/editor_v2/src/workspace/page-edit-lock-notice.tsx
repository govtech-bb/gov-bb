import { useRef, useState, type ReactNode } from "react";
import type { PageEditLockGeneration } from "../api/page-schemas";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { Dialog } from "../ui/dialog";
import { useLatched } from "../ui/use-latched";
import type { IPageEditLockSession, PageEditLockState } from "./page-edit-lock-session";

const RESUME_NOTE =
  "Editing again starts from the saved page, so download any changes you want to keep first.";

/** Ownership notices do not replace the editor; idle and takeover decisions use the existing focus-managed dialogs. */
export function PageEditLockNotice({
  session,
  state,
  signIn,
  recovery,
  pageFocus,
}: {
  session: IPageEditLockSession;
  state: PageEditLockState;
  signIn: ReactNode;
  recovery: ReactNode;
  /** Where focus goes when a dialog closes and what opened it has gone: a control that is still on the page. */
  pageFocus: () => HTMLElement;
}): ReactNode {
  const [takeoverGeneration, setTakeoverGeneration] = useState<PageEditLockGeneration>();
  const idle = state.kind === "awaiting-idle-response" ? state : undefined;
  // Kept for the closing transition
  const asked = useLatched(idle ?? null);
  const stillEditing = useRef<HTMLButtonElement>(null);
  const takeoverTrigger = useRef<HTMLButtonElement>(null);
  const idleOpener = useRef<Element | null>(null);

  // Back to what opened it, or into the page if that has gone; never away from where the author has since moved.
  const returnFocus = (opener: Element | null) => () => {
    const current = document.activeElement;

    if (current && current !== document.body && !current.closest('[role="alertdialog"]'))
      return false;

    return opener instanceof HTMLElement && opener.isConnected ? opener : pageFocus();
  };

  const banner = (): ReactNode => {
    switch (state.kind) {
      case "inactive":
      case "editable":
      case "awaiting-idle-response":
        return null;
      case "acquiring-lock":
        return (
          <Banner layout="strip" tone="info">
            Checking editing ownership…
          </Banner>
        );
      case "locked-by-another-session":
        return (
          <Banner
            layout="strip"
            tone="warning"
            actions={
              <>
                <Button
                  ref={takeoverTrigger}
                  variant="secondary"
                  onClick={() => setTakeoverGeneration(state.status.lockGeneration)}
                >
                  Take over editing
                </Button>
                {recovery}
              </>
            }
          >
            {state.status.holderName} is editing this page in another session. This copy is
            read-only; your open changes are unchanged.
          </Banner>
        );
      case "lock-lost":
        return (
          <Banner
            layout="strip"
            tone="warning"
            actions={
              <>
                <Button variant="secondary" onClick={session.startEditing}>
                  Start editing
                </Button>
                {recovery}
              </>
            }
          >
            {state.reason === "expired"
              ? "Your editing lock expired."
              : state.reason === "replaced"
                ? "Your editing lock was lost."
                : "Editing has stopped."}{" "}
            This copy is read-only and your changes stay in this tab. {RESUME_NOTE}
          </Banner>
        );
      case "lock-unconfirmed":
        return (
          <Banner
            layout="strip"
            tone="warning"
            actions={
              <>
                {state.failure?.kind === "signed-out" ? (
                  signIn
                ) : (
                  <Button variant="secondary" pending={!state.failure} onClick={session.reconcile}>
                    {state.failure ? "Check editing access" : "Checking editing access…"}
                  </Button>
                )}
                {recovery}
              </>
            }
          >
            {state.failure?.kind === "signed-out"
              ? "Your session has ended."
              : state.failure?.kind === "forbidden"
                ? "You no longer have permission to edit this page."
                : "We cannot confirm your editing lock."}{" "}
            This copy is read-only; your open changes are unchanged.
          </Banner>
        );
      default: {
        const unexpected: never = state;
        throw unexpected;
      }
    }
  };

  return (
    <>
      {/* Only a deliberate answer stops or keeps editing: with no onOpenChange, Escape leaves the question open */}
      <Dialog.Root role="alertdialog" open={!!idle}>
        <Dialog.Content
          size="sm"
          initialFocus={() => {
            idleOpener.current = document.activeElement;

            return stillEditing.current;
          }}
          finalFocus={() => returnFocus(idleOpener.current)()}
        >
          <Dialog.Header>
            <Dialog.Title>Are you still editing?</Dialog.Title>
            <Dialog.Description>
              Editing stops at{" "}
              {asked &&
                new Date(asked.status.idleExpiresAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
              unless you answer. Your changes then stay in this tab, read-only. {RESUME_NOTE}
            </Dialog.Description>
          </Dialog.Header>
          <Dialog.Actions>
            <Button size="md" onClick={session.stopEditing}>
              Stop editing
            </Button>
            <Button
              ref={stillEditing}
              size="md"
              variant="accent"
              pending={asked?.responding}
              pendingLabel="Confirming ownership…"
              onClick={session.continueEditing}
            >
              I'm still editing
            </Button>
          </Dialog.Actions>
        </Dialog.Content>
      </Dialog.Root>
      <ConfirmDialog
        // Only for the holder reviewed when it opened: a new holder needs a new question
        open={
          state.kind === "locked-by-another-session" &&
          state.status.lockGeneration === takeoverGeneration
        }
        onOpenChange={(open) => {
          if (!open) setTakeoverGeneration(undefined);
        }}
        title="Take over editing?"
        description="The other editor will lose editing access. You will start from the saved page. Their unsaved changes stay in their open tab."
        confirmLabel="Take over editing"
        variant="accent"
        finalFocus={() => returnFocus(takeoverTrigger.current)()}
        onConfirm={() => {
          if (takeoverGeneration !== undefined) session.takeOver(takeoverGeneration);
          setTakeoverGeneration(undefined);
        }}
      />
      {banner()}
    </>
  );
}
