import type { LexicalEditor, NodeKey } from "lexical";

const states = new WeakMap<LexicalEditor, { toggled: NodeKey | null }>();

/** Shift-selection and the rubber band share state only within their editor. */
export function blockSelectionState(editor: LexicalEditor) {
  let state = states.get(editor);

  if (!state) states.set(editor, (state = { toggled: null }));

  return state;
}

export function clearBlockSelectionState(editor: LexicalEditor) {
  states.delete(editor);
}
