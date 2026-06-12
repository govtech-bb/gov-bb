import { useEffect } from "react";

/** Close a dialog on Escape. Document-level so it works wherever focus sits;
 *  if two dialogs are ever stacked, Escape closes both — acceptable until the
 *  modals move to native <dialog>. */
export function useEscClose(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
}
