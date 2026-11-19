import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { useRef } from "react";
import { Dialog } from "@/ui/dialog";
import { EmptyState } from "@/ui/empty-state";
import { Kbd } from "@/ui/kbd";
import { PreviewSheet } from "@/ui/preview-sheet";
import { useLatched } from "@/ui/use-latched";
import type { ActionRequest } from "../../core/actions";
import { ActionPicker, useActionPicker } from "./action-picker";

/** A dialog that searches the actions a request offers, beside a preview of the highlighted one. */
export function InsertDialog({
  request,
  onClose,
  searchPlaceholder = "Find blocks",
}: {
  /** Where the chosen block goes; null closes the dialog. */
  request: ActionRequest | null;
  onClose: () => void;
  searchPlaceholder?: string;
}) {
  const [editor] = useLexicalComposerContext();
  // The list stays put while the dialog closes
  const shown = useLatched(request);
  const pendingFocus = useRef<(() => void) | undefined>(undefined);

  return (
    <Dialog.Root
      open={request !== null}
      onOpenChange={(open) => !open && onClose()}
      onOpenChangeComplete={(open) => {
        if (open) return;
        const focus = pendingFocus.current;
        pendingFocus.current = undefined;

        if (focus) focus();
        else editor.focus();
      }}
    >
      {/* High on the page, so the list grows down from where the eye already is */}
      <Dialog.Content
        size="lg"
        close={false}
        finalFocus={false}
        className="mt-[12vh] h-[min(560px,76vh)] self-start pb-0"
      >
        <Dialog.Title className="sr-only">Insert a block</Dialog.Title>
        <ActionPicker.Root
          request={shown}
          onInserted={(result) => {
            pendingFocus.current = result?.afterClose;
            onClose();
          }}
        >
          <label className="flex h-12 shrink-0 items-center gap-2.5 border-b border-line px-4">
            <MagnifyingGlass className="size-4 shrink-0 text-muted" />
            <ActionPicker.Search
              autoFocus
              label="Search blocks"
              placeholder={searchPlaceholder}
              className="h-full min-w-0 flex-1 text-16 outline-none placeholder:text-placeholder"
            />
          </label>
          <div className="flex min-h-0 flex-1">
            <ActionPicker.List
              label="Blocks"
              empty="No blocks match your search."
              className="max-h-none w-64 shrink-0 border-r border-line max-sm:w-full max-sm:border-r-0"
            />
            <InsertPreview />
          </div>
        </ActionPicker.Root>
      </Dialog.Content>
    </Dialog.Root>
  );
}

/** The highlighted action's title and description, and the action's own preview of what it inserts. */
function InsertPreview() {
  const { selected } = useActionPicker();

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-y-auto p-6 max-sm:hidden">
      {selected ? (
        <>
          <div className="text-16 font-semibold">{selected.title}</div>
          <p className="mt-1 text-14 leading-5 text-muted">{selected.description}</p>
          {selected.preview && <PreviewSheet>{selected.preview}</PreviewSheet>}
        </>
      ) : (
        <EmptyState
          kind="not-found"
          title="No results"
          description="No blocks match your search. Try another word."
        />
      )}
      <p className="mt-auto flex items-center gap-1 pt-4 text-12 leading-4 text-muted">
        <Kbd>↑</Kbd>
        <Kbd>↓</Kbd>
        <span className="mr-2">to browse</span>
        <Kbd>Enter</Kbd>
        <span>to insert</span>
      </p>
    </div>
  );
}
