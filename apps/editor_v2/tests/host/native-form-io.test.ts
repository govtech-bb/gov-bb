import { $isElementNode } from "lexical";
import { expect, test } from "vitest";
import { $getRoot, $createTextNode, UNDO_COMMAND, REDO_COMMAND } from "lexical";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import { registerEditorHistory } from "../../src/editor/core/history";
import { govbbFormCodec, govbbFormEditor } from "../../src/presets/govbb-form";
import { formSchemaToLexical } from "../../src/converters/form-schema-to-lexical";
import { nativeSemanticEqual } from "../../src/forms/schema";
import { DraftStore } from "../../src/persistence/draft-store";
import { draftEditorConnection } from "../../src/host/draft-editor";
import {
  prepareNativeImport,
  beginNativeImport,
  applyNativeImport,
  exportNativeForm,
} from "../../src/host/native-form-io";
import form from "../fixtures/forms/v2/pension.json";
import birth from "../fixtures/forms/v2/get-birth-certificate.json";

function setup() {
  const imported = formSchemaToLexical(form, govbbFormEditor);

  if (imported.status !== "ready") throw Error(JSON.stringify(imported.diagnostics));
  const store = new DraftStore(govbbFormCodec.encode(imported.state), govbbFormCodec);
  const editor = createHeadlessEditor(govbbFormEditor, store.initial.state);
  const removeHistory = registerEditorHistory(editor);
  const disconnect = store.connect(draftEditorConnection(editor));

  return {
    store,
    editor,
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
      saved = h.store.getSnapshot();

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
    expect(h.store.getSnapshot()).toBe(saved);
  } finally {
    h.close();
  }
});

test("native application uses one undo step and exports the visible form without storage", async () => {
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
    expect(
      nativeSemanticEqual(
        JSON.parse(exportNativeForm(h.store, h.editor, govbbFormEditor).source!),
        form,
      ),
    ).toBe(true);
    h.editor.dispatchCommand(REDO_COMMAND, undefined);
    await Promise.resolve();
    expect(
      nativeSemanticEqual(
        JSON.parse(exportNativeForm(h.store, h.editor, govbbFormEditor).source!),
        birth,
      ),
    ).toBe(true);

    const reloaded = new DraftStore(h.store.getSnapshot().committed, govbbFormCodec);
    expect(reloaded.getSnapshot().valid).toBe(true);
  } finally {
    h.close();
  }
});

test("dirty source, asynchronous intervening edits and host read-only cannot replace the live form", () => {
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
    expect(applyNativeImport(pending, token, h.store, h.editor).status).toBe("rejected");
    const saved = h.store.getSnapshot().committed;
    h.store.edit(saved + "\n");
    expect(beginNativeImport(h.store, h.editor).token).toBeUndefined();
    expect(exportNativeForm(h.store, h.editor, govbbFormEditor).source).toBeUndefined();
    h.store.discard();
    const nextToken = beginNativeImport(h.store, h.editor).token!;
    const state = h.editor.getEditorState();
    h.editor.setEditable(false);
    expect(applyNativeImport(pending, nextToken, h.store, h.editor).status).toBe("rejected");
    expect(h.editor.getEditorState()).toBe(state);
    expect(h.store.getSnapshot().committed).toBe(saved);
  } finally {
    h.close();
  }
});
