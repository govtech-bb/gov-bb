import {
  COMMAND_PRIORITY_LOW,
  KEY_DOWN_COMMAND,
  REDO_COMMAND,
  UNDO_COMMAND,
  mergeRegister,
  type LexicalEditor,
} from "lexical";

type Ownership = {
  members: Set<LexicalEditor>;
  active?: LexicalEditor;
  capturedTarget?: Element;
  dispose: () => void;
};

const documents = new WeakMap<Document, Ownership>();

const scopes = new WeakMap<LexicalEditor, HTMLElement>();

const outsideKeys = new WeakMap<LexicalEditor, (event: KeyboardEvent) => void>();

export function activateEditor(editor: LexicalEditor, target?: EventTarget | null) {
  const scope = scopes.get(editor);
  const ownership = scope && documents.get(scope.ownerDocument);

  if (ownership) {
    ownership.active = editor;
    ownership.capturedTarget = target instanceof Element ? target : undefined;
  }
}

/** The scope includes toolbar/gutter controls; React capture also covers its portals. */
export function registerEditorScope(editor: LexicalEditor, scope: HTMLElement) {
  const ownerDocument = scope.ownerDocument;
  let ownership = documents.get(ownerDocument);

  if (!ownership) {
    const members = new Set<LexicalEditor>();

    const onKeyDown = (event: KeyboardEvent) => {
      const owned = documents.get(ownerDocument);
      const active = owned?.active;
      const target = event.target;

      if (
        event.defaultPrevented ||
        event.isComposing ||
        !active?.isEditable() ||
        !(target instanceof Element)
      )
        return;

      if (target.closest("input, textarea, select, [contenteditable]")) return;
      const ownedScope = scopes.get(active);

      if (
        target === ownerDocument.body ||
        ownedScope?.contains(target) ||
        target === owned?.capturedTarget
      )
        outsideKeys.get(active)?.(event);
    };

    ownerDocument.addEventListener("keydown", onKeyDown);
    ownership = { members, dispose: () => ownerDocument.removeEventListener("keydown", onKeyDown) };
    documents.set(ownerDocument, ownership);
  }

  scopes.set(editor, scope);
  ownership.members.add(editor);

  return () => {
    scopes.delete(editor);
    ownership.members.delete(editor);

    if (ownership.active === editor) {
      ownership.active = undefined;
      ownership.capturedTarget = undefined;
    }

    if (!ownership.members.size) {
      ownership.dispose();
      documents.delete(ownerDocument);
    }
  };
}

export function registerOutsideKeys(
  editor: LexicalEditor,
  handler: (event: KeyboardEvent) => void,
) {
  outsideKeys.set(editor, handler);

  return () => {
    if (outsideKeys.get(editor) === handler) outsideKeys.delete(editor);
  };
}

export function registerHistoryKeys(editor: LexicalEditor) {
  const run = (event: KeyboardEvent) => {
    if (
      !editor.isEditable() ||
      event.isComposing ||
      event.altKey ||
      !(event.metaKey || event.ctrlKey)
    )
      return false;
    const key = event.key.toLowerCase();

    const command =
      key === "z" && !event.shiftKey
        ? UNDO_COMMAND
        : (event.metaKey && key === "z" && event.shiftKey) || (event.ctrlKey && key === "y")
          ? REDO_COMMAND
          : undefined;

    if (!command) return false;
    event.preventDefault();
    editor.dispatchCommand(command, undefined);

    return true;
  };

  return mergeRegister(
    editor.registerCommand(KEY_DOWN_COMMAND, run, COMMAND_PRIORITY_LOW),
    registerOutsideKeys(editor, run),
  );
}
