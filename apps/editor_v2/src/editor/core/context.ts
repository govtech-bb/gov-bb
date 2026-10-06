import type { LexicalEditor } from "lexical";
import type { EditorDefinition } from "./definition";

const definitions = new WeakMap<LexicalEditor, EditorDefinition>();

export const installedEditorDefinition = (editor: LexicalEditor) => definitions.get(editor);

/** Imperative node/command callbacks resolve the same configuration as React. */
export function editorDefinition(editor: LexicalEditor) {
  const definition = definitions.get(editor);

  if (!definition) throw new Error("This editor has no installed definition");

  return definition;
}

export function registerEditorDefinition(editor: LexicalEditor, definition: EditorDefinition) {
  if (definitions.has(editor)) throw new Error("This editor already has an installed definition");
  definitions.set(editor, definition);

  return () => {
    definitions.delete(editor);
  };
}
