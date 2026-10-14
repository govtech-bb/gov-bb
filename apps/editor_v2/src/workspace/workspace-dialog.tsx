import { Dialog } from "@base-ui/react/dialog";
import { X } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Button } from "../ui/button";

export const workspaceDialogInputClass =
  "w-full rounded-sm border border-line-strong bg-white px-3 py-2 text-16 text-ink focus-visible:outline-2 focus-visible:outline-focus";

export function WorkspaceDialog({
  title,
  description,
  children,
  close,
}: {
  title: string;
  description: string;
  children: ReactNode;
  close: () => void;
}) {
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-ink/40" />
        <Dialog.Popup className="fixed start-1/2 top-1/2 z-50 flex max-h-[90dvh] w-[min(38rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto overscroll-contain rounded-sm bg-white p-6 text-ink shadow-popup outline-none">
          <div className="flex items-start justify-between gap-3">
            <Dialog.Title className="text-24 font-semibold">{title}</Dialog.Title>
            <Dialog.Close
              render={<Button icon={<X />} aria-label={`Close ${title.toLowerCase()}`} />}
            />
          </div>
          <Dialog.Description className="my-3 text-16 text-muted">{description}</Dialog.Description>
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
