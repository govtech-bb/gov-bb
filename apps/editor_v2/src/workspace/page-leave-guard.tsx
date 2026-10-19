import { useBlocker } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { pageHasUnsavedChanges, type PageSession } from "./page-sync";

/** One guard for page navigation, browser unload and sign-out; never saves as a side effect. */
export function usePageLeaveGuard({
  getPages,
  activeId,
  discard,
  onSignOut,
}: {
  getPages: () => ReadonlyMap<string, PageSession>;
  activeId?: string;
  discard: (ids: readonly string[]) => void;
  onSignOut: () => Promise<void>;
}) {
  const [signOutRequested, setSignOutRequested] = useState(false);
  const allowedSignOut = useRef(false);
  const affected = useRef<string[]>([]);

  const unsavedIds = () =>
    [...getPages()].flatMap(([id, page]) => (pageHasUnsavedChanges(page) ? [id] : []));

  const saving = () => [...getPages().values()].some((page) => page.isSaving());

  const blocker = useBlocker({
    withResolver: true,
    enableBeforeUnload: () => saving() || unsavedIds().length > 0,
    shouldBlockFn: ({ current, next }) => {
      if (allowedSignOut.current && next.routeId === "/auth" && !saving()) {
        discard(unsavedIds());

        return false;
      }

      if (current.pathname === next.pathname) return false;
      const leavingWorkspace = !next.routeId.startsWith("/_workspace");
      affected.current = unsavedIds().filter((id) => leavingWorkspace || id === activeId);

      return saving() || affected.current.length > 0;
    },
  });

  const performSignOut = async () => {
    // Only a successful sign-out redirects. A failed request must leave the working copies intact.
    allowedSignOut.current = true;

    try {
      await onSignOut();
    } finally {
      allowedSignOut.current = false;
    }
  };

  const pending = saving();
  const ids = signOutRequested ? unsavedIds() : affected.current;

  const dirty = ids.some((id) => {
    const page = getPages().get(id);

    return page && pageHasUnsavedChanges(page);
  });

  return {
    requestSignOut: () => {
      if (saving() || unsavedIds().length) setSignOutRequested(true);
      else void performSignOut();
    },
    dialog: (
      <ConfirmDialog
        open={signOutRequested || blocker.status === "blocked"}
        onClose={() => {
          setSignOutRequested(false);
          blocker.reset?.();
        }}
        title={
          pending
            ? "A save is in progress"
            : signOutRequested
              ? "Sign out?"
              : dirty
                ? "Leave without saving?"
                : "Continue?"
        }
        description={
          pending
            ? "Wait for the save to finish before leaving. You can cancel to stay in the editor."
            : dirty
              ? "Your unsaved changes will be lost. Cancel to keep editing, or download a copy before leaving."
              : "Your changes have been saved."
        }
        confirm={signOutRequested ? "Sign out" : dirty ? "Leave without saving" : "Continue"}
        confirmDisabled={pending}
        onConfirm={() => {
          if (saving()) return;

          if (signOutRequested) {
            setSignOutRequested(false);
            void performSignOut();
          } else {
            discard(affected.current);
            blocker.proceed?.();
          }
        }}
      />
    ),
  };
}
