import { expect, test } from "vitest";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import { govbbFormEditor } from "../../src/presets/govbb-form";
import { formSchemaToLexical } from "../../src/converters/formSchemaToLexical";
import { lexicalToFormSchema } from "../../src/converters/lexicalToFormSchema";
import type { NativeRawNode } from "../../src/forms/editor/native-state";

const form = {
  schemaVersion: 2,
  id: "title-export",
  title: "Styled service name",
  mode: "application",
  locale: "en-BB",
  timeZone: "America/Barbados",
  settings: { visibility: "preview", hiddenAnswers: "retain" },
  blocks: [{ id: "page", type: "page", role: "questions", title: "Your details" }],
};

test("unsupported service-name styling blocks export without throwing or mutating the draft", () => {
  const imported = formSchemaToLexical(form, govbbFormEditor);
  expect(imported.status).toBe("ready");

  if (imported.status !== "ready") throw Error("Fixture did not import");
  const raw = structuredClone(imported.state);
  const nodes: NativeRawNode[] = raw.root.children;
  nodes[0]!.children![0]!.style = "color: red;";
  const editor = createHeadlessEditor(govbbFormEditor, raw);

  try {
    const before = editor.getEditorState().toJSON();
    const result = lexicalToFormSchema(editor.getEditorState(), govbbFormEditor, editor);
    expect(result.status).toBe("blocked");
    expect(result.schema).toBeNull();
    expect(result.diagnostics).toContainEqual({
      code: "native-text",
      severity: "error",
      message: "This inline text property has no native form representation",
      path: ["title"],
      blockId: "title-export",
    });
    expect(editor.getEditorState().toJSON()).toEqual(before);
  } finally {
    editor.dispose();
  }
});
