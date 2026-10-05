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
import { DraftStore, initialDraft } from "../persistence/draft-store";
import type { DraftCodec, DraftKeys } from "../persistence/types";
import { draftEditorConnection } from "./draft-editor";

test("a content-only host applies one history step, persists undo/redo and disconnects cleanly", async () => {
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

  const original = document("Saved content"),
    updated = document("Applied source");

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

  const keys: DraftKeys = {
    committed: "content:current",
    working: "content:working",
    previous: "content:previous",
    legacy: "content:legacy",
  };

  const values = new Map([[keys.committed, codec.encode(original)]]);

  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };

  const initial = initialDraft(
    storage,
    () => {
      throw Error("Existing content must load");
    },
    codec,
    keys,
  );

  const store = new DraftStore(storage, initial, codec, keys);
  const editor = createHeadlessEditor(definition, initial.state);
  const text = () => editor.getEditorState().read(() => $getRoot().getTextContent());

  const savedText = () => {
    const saved = createHeadlessEditor(
      definition,
      definition.validateDocument(JSON.parse(values.get(keys.committed)!)),
    );

    try {
      return saved.read(() => $getRoot().getTextContent());
    } finally {
      saved.dispose();
    }
  };

  const disconnect = store.connect(draftEditorConnection(editor));

  try {
    store.edit(codec.encode(updated));
    expect(editor.isEditable()).toBe(false);
    expect(store.apply()).toBe(true);
    await Promise.resolve();
    expect(text()).toBe("Applied source");
    expect(savedText()).toBe("Applied source");
    expect(editor.isEditable()).toBe(true);
    expect(store.apply()).toBe(true);
    await Promise.resolve();
    editor.dispatchCommand(UNDO_COMMAND, undefined);
    await Promise.resolve();
    store.flush();
    expect(text()).toBe("Saved content");
    expect(savedText()).toBe("Saved content");
    editor.dispatchCommand(REDO_COMMAND, undefined);
    await Promise.resolve();
    store.flush();
    expect(text()).toBe("Applied source");
    expect(savedText()).toBe("Applied source");
    disconnect();
    editor.update(
      () =>
        $getRoot()
          .clear()
          .append($createParagraphNode().append($createTextNode("After disconnect"))),
      { discrete: true, tag: HISTORY_PUSH_TAG },
    );
    store.flush();
    expect(savedText()).toBe("Applied source");
    expect(store.getSnapshot().status).toBe("saved");
  } finally {
    editor.dispose();
  }
});

test("autosave and source Apply or Discard cannot unlock independent host read-only", () => {
  const definition = defineEditor([TextModule(), HistoryModule()]);
  const editor = createHeadlessEditor(definition);

  const codec: DraftCodec = {
    prepare: (source) => ({
      state: definition.validateDocument(JSON.parse(source)),
      source,
      diagnostics: [],
    }),
    encode: (state) => JSON.stringify(state),
    prepareLegacy: (value) => definition.validateDocument(value),
  };

  const keys = { committed: "current", working: "working", previous: "previous", legacy: "legacy" };
  const values = new Map<string, string>();

  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };

  const store = new DraftStore(
    storage,
    initialDraft(storage, () => editor.getEditorState().toJSON(), codec, keys),
    codec,
    keys,
  );

  const disconnect = store.connect(draftEditorConnection(editor));

  try {
    editor.update(
      () =>
        $getRoot()
          .clear()
          .append($createParagraphNode().append($createTextNode("pending"))),
      { discrete: true },
    );
    editor.setEditable(false);
    store.flush();
    expect(editor.isEditable()).toBe(false);
    const saved = store.getSnapshot().source;
    const changed = saved.replace("pending", "applied");
    store.edit(changed);
    expect(store.apply()).toBe(true);
    expect(editor.isEditable()).toBe(false);
    setEditorReadOnly(editor, false);
    expect(editor.isEditable()).toBe(true);
    store.edit(saved);
    expect(editor.isEditable()).toBe(false);
    // The Composer may become read-only while source mode has already paused Lexical.
    setEditorReadOnly(editor, true);
    store.discard();
    expect(editor.isEditable()).toBe(false);
    store.edit(saved);
    expect(store.apply()).toBe(true);
    expect(editor.isEditable()).toBe(false);
    setEditorReadOnly(editor, false);
    expect(editor.isEditable()).toBe(true);
  } finally {
    disconnect();
    editor.dispose();
  }
});

test("journaled imports use one history step and an actual editor update-hook failure requires recovery", async () => {
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

  const original = document("Original content"),
    imported = document("Imported content"),
    next = document("Next import");

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

  const keys: DraftKeys = {
    committed: "saved",
    working: "working",
    previous: "previous",
    legacy: "legacy",
    replacementJournal: "replacement",
  };

  const values = new Map([[keys.committed, codec.encode(original)]]);

  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };

  const initial = initialDraft(storage, () => original, codec, keys);
  const store = new DraftStore(storage, initial, codec, keys);
  const editor = createHeadlessEditor(definition, initial.state);
  const disconnect = store.connect(draftEditorConnection(editor));
  let removeHook = () => {};

  try {
    const prepared = codec.prepare(codec.encode(imported));
    expect(store.replacePrepared(prepared, store.captureReplacementToken()).status).toBe(
      "committed",
    );
    await Promise.resolve();
    editor.dispatchCommand(UNDO_COMMAND, undefined);
    await Promise.resolve();
    store.flush();
    expect(editor.getEditorState().read(() => $getRoot().getTextContent())).toBe(
      "Original content",
    );
    expect(values.get(keys.committed)).toBe(codec.encode(original));
    editor.dispatchCommand(REDO_COMMAND, undefined);
    await Promise.resolve();
    store.flush();
    expect(editor.getEditorState().read(() => $getRoot().getTextContent())).toBe(
      "Imported content",
    );
    removeHook = editor.registerUpdateListener(() => {
      throw Error("Injected update hook failure");
    });
    expect(
      store.replacePrepared(codec.prepare(codec.encode(next)), store.captureReplacementToken())
        .status,
    ).toBe("recovery-required");
    expect(values.get(keys.committed)).toBe(codec.encode(next));
    expect(values.has(keys.replacementJournal!)).toBe(true);
    expect(editor.isEditable()).toBe(false);
    removeHook();
    expect(store.recoverReplacement("original").status).toBe("committed");
    expect(editor.getEditorState().read(() => $getRoot().getTextContent())).toBe(
      "Imported content",
    );
    expect(values.get(keys.committed)).toBe(codec.encode(imported));
    expect(values.has(keys.replacementJournal!)).toBe(false);
  } finally {
    removeHook();
    disconnect();
    editor.dispose();
  }
});
