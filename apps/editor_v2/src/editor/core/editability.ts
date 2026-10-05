import type { LexicalEditor } from "lexical";

type Editability = {
  requested: boolean;
  gates: Map<symbol, boolean>;
  owners: number;
  writing: boolean;
  apply(): void;
  unregister(): void;
};

const states = new WeakMap<LexicalEditor, Editability>();

function acquire(editor: LexicalEditor) {
  let state = states.get(editor);

  if (!state) {
    const current: Editability = {
      requested: editor.isEditable(),
      gates: new Map(),
      owners: 0,
      writing: false,
      unregister: () => {},
      apply() {
        current.writing = true;

        try {
          editor.setEditable(current.requested && [...current.gates.values()].every(Boolean));
        } finally {
          current.writing = false;
        }
      },
    };

    current.unregister = editor.registerEditableListener((editable) => {
      if (current.writing) return;
      current.requested = editable;
      current.apply();
    });
    states.set(editor, current);
    state = current;
  }

  state.owners++;
  let released = false;

  return {
    state,
    release() {
      if (released) return;
      released = true;

      if (--state.owners === 0) {
        state.unregister();
        states.delete(editor);
      }
    },
  };
}

/** Tracks the host's intent independently of temporary source/recovery pauses. */
export function registerEditorEditability(editor: LexicalEditor) {
  return acquire(editor).release;
}

export function setEditorReadOnly(editor: LexicalEditor, readOnly: boolean) {
  const state = states.get(editor);

  if (!state) throw new Error("Editor editability ownership is missing");
  state.requested = !readOnly;
  state.apply();
}

/** A host adapter owns one pause, never the editor's independent read-only policy. */
export function createEditableGate(editor: LexicalEditor) {
  const { state, release } = acquire(editor);
  const key = Symbol("editing-pause");
  let disposed = false;
  state.gates.set(key, true);

  return {
    setAllowed(allowed: boolean) {
      if (!disposed) {
        state.gates.set(key, allowed);
        state.apply();
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      state.gates.delete(key);
      state.apply();
      release();
    },
  };
}
