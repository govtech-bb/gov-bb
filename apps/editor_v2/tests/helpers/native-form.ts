import { $createParagraphNode, $getRoot, type LexicalEditor } from "lexical";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import { formSchemaToLexical } from "../../src/converters/formSchemaToLexical";
import { lexicalToFormSchema } from "../../src/converters/lexicalToFormSchema";
import type { FormEditorDefinition } from "../../src/forms/definition";
import type { AnyFormDefinition } from "../../src/forms/schema";
import { govbbFormEditor } from "../../src/presets/govbb-form";

export const emptyNativeForm: AnyFormDefinition = {
  schemaVersion: 2,
  id: "application",
  title: "Application",
  mode: "application",
  locale: "en-BB",
  timeZone: "America/Barbados",
  settings: { visibility: "draft", hiddenAnswers: "retain" },
  blocks: [{ id: "details", type: "page", role: "questions", title: "Details" }],
};

export function nativeHost(definition = govbbFormEditor, form = emptyNativeForm) {
  const prepared = formSchemaToLexical(form, definition);

  if (prepared.status !== "ready")
    throw Error(prepared.diagnostics.map((issue) => issue.message).join("\n"));
  const editor = createHeadlessEditor(definition, prepared.state);
  editor.update(() => $getRoot().append($createParagraphNode()), { discrete: true });

  return editor;
}

export function nativeOutput(
  editor: LexicalEditor,
  definition: FormEditorDefinition = govbbFormEditor,
): AnyFormDefinition {
  const output = lexicalToFormSchema(editor.getEditorState(), definition, editor);

  if (!output.schema) throw Error(output.diagnostics.map((issue) => issue.message).join("\n"));

  return output.schema;
}
