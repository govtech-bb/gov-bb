import { useState, type ReactNode } from "react";
import type { PageEditLockGeneration } from "../api/page-schemas";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { Dialog } from "../ui/dialog";
import type { IPageEditLockSession, PageEditLockState } from "./page-edit-lock-session";

/** Ownership notices do not replace the editor; idle and takeover decisions use the existing focus-managed dialogs. */
export function PageEditLockNotice({
  session,
  state,
  signIn,
  recovery,
}: {
  session: IPageEditLockSession;
  state: PageEditLockState;
  signIn: ReactNode;
  recovery: ReactNode;
}): ReactNode {
  const [takeoverGeneration, setTakeoverGeneration] = useState<PageEditLockGeneration>();

  switch (state.kind) {
    case "inactive":
    case "editable":
      return null;
    case "acquiring-lock":
      return (
        <Banner layout="strip" tone="info">
          Checking editing ownership…
        </Banner>
      );
    case "awaiting-idle-response":
      return (
        <Dialog.Root
          role="alertdialog"
          open
          onOpenChange={(open) => {
            if (!open) session.stopEditing();
          }}
        >
          <Dialog.Content size="sm" close={false}>
            <Dialog.Header>
              <Dialog.Title>Are you still editing?</Dialog.Title>
              <Dialog.Description>
                Your editing lock expires at{" "}
                {new Date(state.status.idleExpiresAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                . If you stop editing, your changes stay in this open tab but the page becomes
                read-only.
              </Dialog.Description>
            </Dialog.Header>
            <Dialog.Actions>
              <Button size="md" onClick={session.stopEditing}>
                Stop editing
              </Button>
              <Button
                size="md"
                variant="accent"
                pending={state.responding}
                onClick={session.continueEditing}
              >
                {state.responding ? "Confirming ownership…" : "I'm still editing"}
              </Button>
            </Dialog.Actions>
          </Dialog.Content>
        </Dialog.Root>
      );
    case "locked-by-another-session":
      return (
        <>
          <Banner
            layout="strip"
            tone="warning"
            actions={
              <>
                <Button
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
          <ConfirmDialog
            open={takeoverGeneration !== undefined}
            onClose={() => setTakeoverGeneration(undefined)}
            title="Take over editing?"
            description="The other editor will lose editing access. You will start from the saved page. Their unsaved changes stay in their open tab."
            confirm="Take over editing"
            tone="accent"
            onConfirm={() => {
              if (takeoverGeneration !== undefined) session.takeOver(takeoverGeneration);
              setTakeoverGeneration(undefined);
            }}
          />
        </>
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
          This copy is read-only. Your changes stay here while this tab is open.
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
}
