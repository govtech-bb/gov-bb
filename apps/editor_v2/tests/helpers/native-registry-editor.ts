import { expect } from "vitest";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import { govbbFormEditor } from "../../src/presets/govbb-form";
import { formSchemaToLexical } from "../../src/converters/form-schema-to-lexical";
import { lexicalToFormSchema } from "../../src/converters/lexical-to-form-schema";
import { lexicalToFormMarkdown } from "../../src/converters/lexical-to-form-markdown";
import { formMarkdownToLexical } from "../../src/converters/form-markdown-to-lexical";
import type { AnyFormDefinition, QuestionBase } from "../../src/forms/schema";

export function nativeRegistryEditor() {
  const imported = formSchemaToLexical(
    {
      schemaVersion: 2,
      id: "registry-test",
      title: "Registry test",
      mode: "application",
      locale: "en-BB",
      timeZone: "America/Barbados",
      settings: { visibility: "preview", hiddenAnswers: "retain" },
      blocks: [{ id: "first-page", type: "page", role: "questions", title: "Your details" }],
    },
    govbbFormEditor,
  );

  if (imported.status !== "ready") throw Error(JSON.stringify(imported.diagnostics));

  return createHeadlessEditor(govbbFormEditor, imported.state);
}

export type NativeRegistryEditor = ReturnType<typeof nativeRegistryEditor>;

export function nativeRegistryForm(editor: NativeRegistryEditor) {
  const result = lexicalToFormSchema(editor.getEditorState(), govbbFormEditor, editor);
  expect(result.diagnostics).toEqual([]);

  if (result.status !== "ready") throw Error("Native registry export failed");

  return result.schema;
}

export const nativeQuestions = (form: AnyFormDefinition) =>
  form.blocks.filter((block): block is QuestionBase => block.type === "question");

export function reloadNativeRegistryEditor(editor: NativeRegistryEditor) {
  const source = lexicalToFormMarkdown(editor.getEditorState().toJSON(), govbbFormEditor);
  const parsed = formMarkdownToLexical(source, govbbFormEditor);
  expect(parsed.diagnostics.filter((issue) => issue.severity === "fatal")).toEqual([]);

  if (!parsed.state) throw Error("Native registry Markdown failed");

  return createHeadlessEditor(govbbFormEditor, parsed.state);
}
