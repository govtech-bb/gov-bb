import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getRoot } from "lexical";
import { useSyncExternalStore, type ReactNode } from "react";
import type { EditorDefinition } from "../editor/core/definition";
import { EditorComposer } from "../editor/react/composer";
import { $createFormTitleNode, $isFormTitleNode } from "../forms/editor/nodes";
import { draftPause, type DraftStore } from "../persistence/draft-store";
import { DraftEditorBinding, DraftProvider, useDraft } from "./source-ui";

/** Optional application binding; reusable form canvases do not require a draft store. */
export function FormComposer({
  children,
  definition,
  store,
  readOnly,
}: {
  children: ReactNode;
  definition: EditorDefinition;
  store: DraftStore;
  readOnly?: boolean;
}) {
  return (
    <EditorComposer
      definition={definition}
      readOnly={readOnly}
      initialState={store.initial.state}
      initialize={() => $getRoot().append($createFormTitleNode())}
    >
      <DraftProvider store={store}>
        <DraftEditorBinding />
        {children}
      </DraftProvider>
    </EditorComposer>
  );
}

export function DraftCanvas({ children }: { children: ReactNode }) {
  const draft = useDraft();

  if (!draft.valid)
    return (
      <p className="p-8 text-16 text-muted">
        Open the saved source to recover this form. The original draft is available to download.
      </p>
    );

  // The form's document bar says why it's paused (PausedNotice)
  return (
    <div className="contents" inert={!!draftPause(draft)}>
      {children}
    </div>
  );
}

/** The form's name as it's typed, the service name over every page on the canvas: for the document's h1. */
export function FormTitle() {
  const [editor] = useLexicalComposerContext();

  const title = useSyncExternalStore(
    (notify) => editor.registerUpdateListener(notify),
    () =>
      editor.getEditorState().read(() => {
        const first = $getRoot().getFirstChild();

        return first && $isFormTitleNode(first) ? first.getTextContent() : "";
      }),
  );

  return title.trim() || "Untitled form";
}
