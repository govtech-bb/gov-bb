import { expect, test } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { createHeadlessEditor } from "../../src/editor";
import { lexicalToFormSchema, nativeSemanticEqual } from "../../src/forms";
import { draftEditorConnection } from "../../src/host";
import { $setPageMetadata, readPageMetadata } from "../../src/pages";
import { demoForm } from "../../src/presets/demo";
import { govbbFormEditor } from "../../src/presets/govbb-form";
import { govbbPageCodec, govbbPageEditor } from "../../src/presets/govbb-page";
import {
  createExampleStore,
  convertExample,
  examplePageSource,
  initialPage,
} from "./editor-system";

test("documented form is the current native demo and survives Markdown without semantic drift", () => {
  const result = convertExample();
  expect(result.reloadedSource).toBe(result.source);
  expect(result.output.status).toBe("ready");
  expect(result.output.diagnostics).toEqual([]);
  expect(nativeSemanticEqual(result.output.schema, demoForm)).toBe(true);
  const demoPath = new URL("./demo-form.md", import.meta.url);

  if (process.env.EDITOR_GENERATE_DEMO === "1") writeFileSync(demoPath, result.source);
  expect(readFileSync(demoPath, "utf8")).toBe(result.source);
});

test("documented service page preserves source and metadata when edited", () => {
  const page = initialPage();

  if (page.mode === "source") throw new Error("The example page must be visually editable");
  expect(govbbPageCodec.encode(page.state)).toBe(examplePageSource);
  const editor = createHeadlessEditor(govbbPageEditor, page.state);

  try {
    editor.update(() => $setPageMetadata({ title: "Loud music permits" }), { discrete: true });
    const source = govbbPageCodec.encode(editor.getEditorState().toJSON());
    expect(readPageMetadata(source)).toMatchObject({ title: "Loud music permits" });
    expect(source).toContain("form_id: loud-music-permit");
    expect(source).toContain("stage: draft");
    expect(source).toContain(":::notice");
    const reopened = initialPage(source);

    if (reopened.mode === "source")
      throw new Error("The edited page must remain visually editable");
    expect(govbbPageCodec.encode(reopened.state)).toBe(source);
  } finally {
    editor.dispose();
  }
});

test("documented page import preserves unsupported content and rejects invalid YAML", () => {
  const source = `${examplePageSource}\n<!-- Keep this editorial note -->\n`;
  const page = initialPage(source);
  expect(page.mode).toBe("source");
  expect(page.source).toBe(source);
  expect(page.state).toBeUndefined();
  expect(page.diagnostics[0]?.code).toBe("page-source-only");
  expect(() => initialPage("---\ntitle: [broken\n---\n\nBody")).toThrow(
    "Correct the page metadata",
  );
});

test("documented form store saves through the host connection and reloads the same native form", () => {
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

  const keys = {
    committed: "example:source",
    working: "example:working",
    previous: "example:v1",
    legacy: "example:json",
    nativeMigrationBackup: "example:native-original",
    replacementJournal: "example:replacement",
  };

  const store = createExampleStore(storage, keys);
  expect(store.initial.snapshot.valid).toBe(true);
  const editor = createHeadlessEditor(govbbFormEditor, store.initial.state);
  const disconnect = store.connect(draftEditorConnection(editor));

  try {
    expect(store.getSnapshot().status).toBe("saved");
    expect(values.get(keys.committed)).toBe(convertExample().source);
    const reopened = createExampleStore(storage, keys);
    expect(reopened.initial.snapshot.status).toBe("saved");
    const reloadedEditor = createHeadlessEditor(govbbFormEditor, reopened.initial.state);

    try {
      const output = lexicalToFormSchema(
        reloadedEditor.getEditorState(),
        govbbFormEditor,
        reloadedEditor,
      );

      expect(output.status).toBe("ready");
      expect(nativeSemanticEqual(output.schema, demoForm)).toBe(true);
    } finally {
      reloadedEditor.dispose();
    }
  } finally {
    disconnect();
    editor.dispose();
  }
});
