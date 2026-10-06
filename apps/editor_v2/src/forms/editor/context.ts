import { $getEditor, type EditorState, type LexicalEditor } from "lexical";
import { createHeadlessEditor } from "../../editor/core/create-editor";
import { editorDefinition } from "../../editor/core/context";
import { formDefinition, type FormEditorDefinition } from "../definition";

export const $formDefinition = () => formDefinition(editorDefinition($getEditor()));

export const $fieldDefinition = (kind: string) =>
  $formDefinition().fields.find((field) => field.kind === kind);

/** A read uses the existing nodes; the context never hydrates or normalizes the supplied state. */
export function readFormState<T>(
  state: EditorState,
  definition: FormEditorDefinition,
  read: () => T,
  editor?: LexicalEditor,
): T {
  definition.validateDocument(state.toJSON());

  if (editor) {
    if (editorDefinition(editor) !== definition)
      throw new Error("Form reads must use this editor's installed definition");

    return state.read(read, { editor });
  }

  const context = createHeadlessEditor(definition, undefined, { prepare: false });

  try {
    return state.read(read, { editor: context });
  } finally {
    context.dispose();
  }
}
