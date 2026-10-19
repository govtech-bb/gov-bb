import { $createParagraphNode, $getRoot, type LexicalEditor } from "lexical";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import { formSchemaToLexical } from "../../src/converters/form-schema-to-lexical";
import { lexicalToFormSchema } from "../../src/converters/lexical-to-form-schema";
import type { FormEditorDefinition } from "../../src/forms/definition";
import type { AnyFormDefinition } from "../../src/forms/schema";
import { $withDefaultFormMessages } from "../../src/forms/editor/native-bindings";
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

/** A form as export words it: each message nobody wrote, from its question's label. */
export function withDefaultMessages(
  form: AnyFormDefinition,
  definition: FormEditorDefinition = govbbFormEditor,
) {
  const editor = createHeadlessEditor(definition, undefined, { prepare: false });

  try {
    return editor.read(() => $withDefaultFormMessages(form, definition));
  } finally {
    editor.dispose();
  }
}

export function nativeOutput(
  editor: LexicalEditor,
  definition: FormEditorDefinition = govbbFormEditor,
): AnyFormDefinition {
  const output = lexicalToFormSchema(editor.getEditorState(), definition, editor);

  if (!output.schema) throw Error(output.diagnostics.map((issue) => issue.message).join("\n"));

  return output.schema;
}
