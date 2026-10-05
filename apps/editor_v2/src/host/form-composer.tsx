import { $getRoot } from "lexical";
import type { ReactNode } from "react";
import type { EditorDefinition } from "../editor/core/definition";
import { EditorComposer } from "../editor/react/composer";
import { $createFormTitleNode } from "../forms/editor/nodes";
import type { DraftStore } from "../persistence/draft-store";
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

  return (
    <div
      className="contents"
      inert={draft.dirty || !!draft.conflict}
      aria-label={draft.dirty ? "Canvas paused while source changes are unapplied" : undefined}
    >
      {children}
    </div>
  );
}
