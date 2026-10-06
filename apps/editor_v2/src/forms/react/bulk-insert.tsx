import { Dialog } from "@base-ui/react/dialog";
import { useState } from "react";
import { Button } from "../../ui/button";

export function BulkInsertDialog({
  open,
  onOpenChange,
  onInsert,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInsert: (options: string[]) => void;
}) {
  const [text, setText] = useState("");

  return (
    <Dialog.Root
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(isOpen) => !isOpen && setText("")}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-ink/40 transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Viewport className="fixed inset-0 z-50 grid place-items-center p-4">
          <Dialog.Popup className="max-h-[90vh] w-full max-w-125 overflow-y-auto rounded-sm bg-white font-sans text-ink shadow-popup outline-none transition data-ending-style:translate-y-2.5 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:translate-y-2.5 data-starting-style:scale-95 data-starting-style:opacity-0">
            <div className="px-5 pt-6">
              <Dialog.Title className="flex items-center border-b border-line pb-5 text-16 font-semibold">
                Bulk insert options
              </Dialog.Title>
              <Dialog.Description className="mt-5 text-14 leading-normal text-muted">
                Type or paste the options, one on each line.
              </Dialog.Description>
              <textarea
                autoFocus
                rows={8}
                value={text}
                aria-label="Options, one per line"
                placeholder={"Option 1\nOption 2\nOption 3\nOption 4\nOption 5"}
                onChange={(e) => setText(e.target.value)}
                className="mt-4 mb-5 w-full resize-y rounded-sm bg-white px-2.5 py-2.25 text-14 leading-normal shadow-input outline-none placeholder:text-placeholder hover:shadow-input-hover focus:shadow-input-focus max-sm:text-16"
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-line px-3.5 py-3">
              <Dialog.Close render={<Button>Cancel</Button>} />
              <Button
                variant="accent"
                onClick={() => {
                  onInsert(
                    text
                      .split("\n")
                      .map((line) => line.trim())
                      .filter(Boolean),
                  );
                  onOpenChange(false);
                }}
              >
                Insert options
              </Button>
            </div>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
