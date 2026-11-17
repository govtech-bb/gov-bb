import { HISTORY_MERGE_TAG, UNDO_COMMAND, type LexicalEditor } from "lexical";
import { dismissToast, toast } from "../../ui/toast";

/**
 * After a change that loses work, such as deleting a page: a toast titled `title` whose Undo takes the editor back one
 * step. It goes as soon as anything else changes, while Undo would still be the change it names. Call it once the
 * change is in (`$onUpdate`, or after a discrete update).
 */
export function toastWithUndo(editor: LexicalEditor, title: string) {
  const after = JSON.stringify(editor.getEditorState());

  const id = toast(title, {
    action: {
      label: "Undo",
      onClick: () => {
        if (editor.isEditable()) editor.dispatchCommand(UNDO_COMMAND, undefined);
      },
    },
  });

  const stop = editor.registerUpdateListener(({ editorState, tags }) => {
    // A merged update belongs to the same undo step
    if (tags.has(HISTORY_MERGE_TAG) || JSON.stringify(editorState) === after) return;
    stop();
    dismissToast(id);
  });
}
