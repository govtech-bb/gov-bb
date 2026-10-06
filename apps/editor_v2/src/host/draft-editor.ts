import { createEditableGate } from "../editor/core/editability";
import { HISTORY_PUSH_TAG, type LexicalEditor } from "lexical";
import type { DraftConnection } from "../persistence/types";

export function draftEditorConnection(editor: LexicalEditor): DraftConnection {
  const gate = createEditableGate(editor);

  return {
    prepare(value) {
      const state = editor.parseEditorState(value);

      return () => editor.setEditorState(state, { tag: HISTORY_PUSH_TAG });
    },
    getState: () => editor.getEditorState().toJSON(),
    setEditable: gate.setAllowed,
    subscribe: (listener) => {
      const unregister = editor.registerUpdateListener(
        ({ editorState, dirtyElements, dirtyLeaves }) => {
          if (dirtyElements.size || dirtyLeaves.size) listener(editorState.toJSON());
        },
      );

      return () => {
        unregister();
        gate.dispose();
      };
    },
  };
}
