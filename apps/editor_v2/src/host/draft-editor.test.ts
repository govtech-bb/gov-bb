import { setEditorReadOnly } from "../editor/core/editability";
import { expect, test } from "vitest";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  HISTORY_PUSH_TAG,
  REDO_COMMAND,
  UNDO_COMMAND,
} from "lexical";
import { defineEditor } from "../editor/core/definition";
import { createHeadlessEditor } from "../editor/core/create-editor";
import { HistoryModule } from "../editor/modules/history/module";
import { TextModule } from "../editor/modules/text/module";
import { DraftStore } from "../persistence/draft-store";
import type { DraftCodec } from "../persistence/types";
import { draftEditorConnection } from "./draft-editor";

function host() {
  const definition = defineEditor([TextModule(), HistoryModule()]);
  const creator = createHeadlessEditor(definition);

  const document = (text: string) => {
    creator.update(
      () =>
        $getRoot()
          .clear()
          .append($createParagraphNode().append($createTextNode(text))),
      { discrete: true },
    );

    return creator.getEditorState().toJSON();
  };

  const original = document("Original");
  const updated = document("Applied");
  creator.dispose();

  const codec: DraftCodec = {
    prepare: (source) => ({
      state: definition.validateDocument(JSON.parse(source)),
      source,
      diagnostics: [],
    }),
    encode: (state) => JSON.stringify(state),
    prepareLegacy: (value) => definition.validateDocument(value),
  };

  const store = new DraftStore(codec.encode(original), codec);
  const editor = createHeadlessEditor(definition, store.initial.state);
  const disconnect = store.connect(draftEditorConnection(editor));

  return {
    editor,
    store,
    codec,
    original,
    updated,
    disconnect,
    text: () => editor.getEditorState().read(() => $getRoot().getTextContent()),
    close: () => {
      disconnect();
      editor.dispose();
    },
  };
}

test("Apply is one undo step; undo/redo update in-memory source and disconnect removes its listener", async () => {
  const h = host();

  try {
    h.store.edit(h.codec.encode(h.updated));
    expect(h.editor.isEditable()).toBe(false);
    expect(h.store.apply()).toBe(true);
    await Promise.resolve();
    expect(h.text()).toBe("Applied");
    expect(h.store.apply()).toBe(true);
    await Promise.resolve();
    h.editor.dispatchCommand(UNDO_COMMAND, undefined);
    await Promise.resolve();
    expect(h.text()).toBe("Original");
    expect(h.store.getSnapshot().committed).toBe(h.codec.encode(h.original));
    h.editor.dispatchCommand(REDO_COMMAND, undefined);
    await Promise.resolve();
    expect(h.text()).toBe("Applied");
    expect(h.store.getSnapshot().committed).toBe(h.codec.encode(h.updated));
    h.disconnect();
    h.editor.update(
      () =>
        $getRoot()
          .clear()
          .append($createParagraphNode().append($createTextNode("Detached"))),
      { discrete: true, tag: HISTORY_PUSH_TAG },
    );
    expect(h.store.getSnapshot().committed).toBe(h.codec.encode(h.updated));
  } finally {
    h.close();
  }
});

test("source Apply and Discard cannot unlock the independent host read-only gate", () => {
  const h = host();

  try {
    setEditorReadOnly(h.editor, true);
    h.store.edit(h.codec.encode(h.updated));
    expect(h.store.apply()).toBe(true);
    expect(h.editor.isEditable()).toBe(false);
    setEditorReadOnly(h.editor, false);
    expect(h.editor.isEditable()).toBe(true);
    h.store.edit(h.codec.encode(h.original));
    setEditorReadOnly(h.editor, true);
    h.store.discard();
    expect(h.editor.isEditable()).toBe(false);
    setEditorReadOnly(h.editor, false);
    expect(h.editor.isEditable()).toBe(true);
  } finally {
    h.close();
  }
});

test("an actual update-hook failure retains both sources and can be explicitly reapplied", async () => {
  const h = host();
  let remove = () => {};

  try {
    remove = h.editor.registerUpdateListener(() => {
      throw Error("Injected hook failure");
    });
    expect(
      h.store.replacePrepared(
        h.codec.prepare(h.codec.encode(h.updated)),
        h.store.captureReplacementToken(),
      ).status,
    ).toBe("rejected");
    expect(h.store.getSnapshot()).toMatchObject({
      valid: false,
      source: h.codec.encode(h.updated),
      committed: h.codec.encode(h.original),
      recovery: { original: h.codec.encode(h.original) },
    });
    expect(h.editor.isEditable()).toBe(false);
    remove();
    expect(h.store.apply()).toBe(true);
    await Promise.resolve();
    expect(h.text()).toBe("Applied");
    expect(h.editor.isEditable()).toBe(true);
  } finally {
    remove();
    h.close();
  }
});
