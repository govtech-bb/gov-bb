import { $isElementNode } from "lexical";
import { expect, test } from "vitest";
import { $getRoot, $createTextNode, UNDO_COMMAND, REDO_COMMAND } from "lexical";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import { registerEditorHistory } from "../../src/editor/core/history";
import { govbbFormCodec, govbbFormEditor } from "../../src/presets/govbb-form";
import { formSchemaToLexical } from "../../src/converters/formSchemaToLexical";
import { nativeSemanticEqual } from "../../src/forms/schema";
import { DraftStore, initialDraft } from "../../src/persistence/draft-store";
import { draftEditorConnection } from "../../src/host/draft-editor";
import {
  prepareNativeImport,
  beginNativeImport,
  applyNativeImport,
  exportNativeForm,
} from "../../src/host/native-form-io";
import type { DraftKeys } from "../../src/persistence/types";
import form from "../fixtures/forms/v2/pension.json";
import birth from "../fixtures/forms/v2/get-birth-certificate.json";

function setup(
  keys: DraftKeys = {
    committed: "saved",
    working: "working",
    previous: "previous",
    legacy: "legacy",
    replacementJournal: "journal",
    nativeMigrationBackup: "original",
  },
) {
  const imported = formSchemaToLexical(form, govbbFormEditor);

  if (imported.status !== "ready") throw Error(JSON.stringify(imported.diagnostics));
  const values = new Map([[keys.committed, govbbFormCodec.encode(imported.state)]]);
  let rejectKey = "";

  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (key === rejectKey) throw Error("Quota exceeded");
      values.set(key, value);
    },
    removeItem: (key: string) => {
      if (key === rejectKey) throw Error("Removal failed");
      values.delete(key);
    },
  };

  const initial = initialDraft(storage, () => imported.state, govbbFormCodec, keys);
  const store = new DraftStore(storage, initial, govbbFormCodec, keys);
  const editor = createHeadlessEditor(govbbFormEditor, initial.state);
  const removeHistory = registerEditorHistory(editor);
  const disconnect = store.connect(draftEditorConnection(editor));

  return {
    keys,
    storage,
    values,
    store,
    editor,
    reject: (key: string) => {
      rejectKey = key;
    },
    close: () => {
      disconnect();
      removeHistory();
      editor.dispose();
    },
  };
}

test("native upload preparation retains exact bytes for parse/version/reference failures and never touches the draft", () => {
  const h = setup();

  try {
    const state = h.editor.getEditorState(),
      saved = new Map(h.values);

    for (const source of [
      "  bad JSON \n",
      JSON.stringify({ ...form, schemaVersion: 3 }),
      JSON.stringify({
        ...form,
        blocks: [
          { id: "p", type: "page", role: "questions", title: "Bad" },
          { id: "c", type: "calculated", valueType: "number", expression: { answer: "missing" } },
        ],
      }),
    ]) {
      const pending = prepareNativeImport(source, govbbFormEditor, govbbFormCodec);
      expect(pending.status).toBe("blocked");
      expect(pending.source).toBe(source);
      expect(pending.diagnostics.length).toBeGreaterThan(0);
    }

    expect(h.editor.getEditorState()).toBe(state);
    expect(h.values).toEqual(saved);
  } finally {
    h.close();
  }
});

test("native application uses one undo step, exports the visible form, and survives storage reload", async () => {
  const h = setup();

  try {
    const pending = prepareNativeImport(JSON.stringify(birth), govbbFormEditor, govbbFormCodec);
    expect(pending.diagnostics).toEqual([]);
    const token = beginNativeImport(h.store, h.editor).token!;
    expect(applyNativeImport(pending, token, h.store, h.editor).status).toBe("committed");
    await Promise.resolve();
    expect(
      nativeSemanticEqual(
        JSON.parse(exportNativeForm(h.store, h.editor, govbbFormEditor).source!),
        birth,
      ),
    ).toBe(true);
    h.editor.dispatchCommand(UNDO_COMMAND, undefined);
    await Promise.resolve();
    h.store.flush();
    expect(
      nativeSemanticEqual(
        JSON.parse(exportNativeForm(h.store, h.editor, govbbFormEditor).source!),
        form,
      ),
    ).toBe(true);
    h.editor.dispatchCommand(REDO_COMMAND, undefined);
    await Promise.resolve();
    h.store.flush();
    expect(
      nativeSemanticEqual(
        JSON.parse(exportNativeForm(h.store, h.editor, govbbFormEditor).source!),
        birth,
      ),
    ).toBe(true);

    const reloaded = initialDraft(
      h.storage,
      () => {
        throw Error("Missing draft");
      },
      govbbFormCodec,
      h.keys,
    );

    expect(reloaded.snapshot.valid).toBe(true);
    expect(reloaded.snapshot.committed).toBe(h.values.get(h.keys.committed)!);
    expect(h.values.has(h.keys.replacementJournal!)).toBe(false);
  } finally {
    h.close();
  }
});

test("dirty source, asynchronous intervening edits, competing tabs and precommit quota cannot replace the live form", () => {
  const h = setup();

  try {
    const pending = prepareNativeImport(JSON.stringify(birth), govbbFormEditor, govbbFormCodec);
    const token = beginNativeImport(h.store, h.editor).token!;
    h.editor.update(
      () => {
        const title = $getRoot().getFirstChild();

        if ($isElementNode(title)) title.clear().append($createTextNode("Edited while file read"));
      },
      { discrete: true },
    );
    h.store.flush();
    expect(applyNativeImport(pending, token, h.store, h.editor).status).toBe("rejected");
    const saved = h.values.get(h.keys.committed)!;
    h.store.edit(saved + "\n");
    expect(beginNativeImport(h.store, h.editor).token).toBeUndefined();
    expect(exportNativeForm(h.store, h.editor, govbbFormEditor).source).toBeUndefined();
    h.store.discard();
    const nextToken = beginNativeImport(h.store, h.editor).token!;
    const state = h.editor.getEditorState();
    h.reject(h.keys.replacementJournal!);
    expect(applyNativeImport(pending, nextToken, h.store, h.editor).status).toBe("rejected");
    expect(h.editor.getEditorState()).toBe(state);
    expect(h.values.get(h.keys.committed)).toBe(saved);
    h.reject("");
    h.values.set(h.keys.committed, saved + "\n\n");
    expect(applyNativeImport(pending, nextToken, h.store, h.editor).status).toBe("rejected");
    expect(h.editor.getEditorState()).toBe(state);
  } finally {
    h.close();
  }
});
