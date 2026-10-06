import { describe, expect, test } from "vitest";
import { $getRoot, $createTextNode } from "lexical";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import { govbbFormEditor } from "../../src/presets/govbb-form";
import { formSchemaToLexical } from "../../src/converters/formSchemaToLexical";
import { lexicalToFormSchema } from "../../src/converters/lexicalToFormSchema";
import { nativeSemanticEqual } from "../../src/forms/schema/semantics";
import { $native } from "../../src/forms/editor/native-state";
import { $updateSettings, $isQuestionNode, $isPageTitleNode } from "../../src/forms/editor/nodes";
import type { AnyFormDefinition } from "../../src/forms/schema/types";
import pension from "../fixtures/forms/v2/pension.json";
import severance from "../fixtures/forms/v2/severance.json";
import nis from "../fixtures/forms/v2/nis.json";
import identity from "../fixtures/forms/v2/examples/passport-example.json";
import repeat from "../fixtures/forms/v2/examples/repeat-example.json";

export const basicNativeForm: AnyFormDefinition = {
  schemaVersion: 2,
  id: "editable-native-form",
  title: "Editable native form",
  mode: "application",
  locale: "en-BB",
  timeZone: "America/Barbados",
  settings: { visibility: "preview", hiddenAnswers: "retain" },
  blocks: [
    {
      id: "first-page",
      type: "page",
      role: "questions",
      title: ["About ", { text: "you", marks: ["bold"] }],
    },
    {
      id: "name",
      type: "question",
      kind: "text",
      key: "firstName",
      label: "Your name",
      hint: "As shown on your passport",
      required: { value: false, message: "Enter your name" },
      default: "",
      config: { width: "long" },
    },
    {
      id: "choice",
      type: "question",
      kind: "choice",
      key: "choice",
      label: "Pick a number",
      config: { selection: "single" },
      options: [
        { id: "one", value: 0, label: "Zero" },
        { id: "two", value: 2, label: "Two" },
      ],
    },
    { id: "confirmation", type: "page", role: "confirmation", title: "Application submitted" },
  ],
};

describe("native form converters", () => {
  for (const [name, form] of Object.entries({
    basic: basicNativeForm,
    pension,
    severance,
    nis,
    identity,
    repeat,
  }))
    test(`${name} imports editable content and exports the same native meaning`, () => {
      const result = formSchemaToLexical(form, govbbFormEditor);
      expect(result.diagnostics).toEqual([]);
      expect(result.status).toBe("ready");

      if (result.status !== "ready") return;
      const editor = createHeadlessEditor(govbbFormEditor, result.state);

      try {
        const before = editor.getEditorState().toJSON();
        const exported = lexicalToFormSchema(editor.getEditorState(), govbbFormEditor, editor);
        expect(exported.status).toBe("ready");
        expect(nativeSemanticEqual(exported.schema, form)).toBe(true);
        expect(lexicalToFormSchema(editor.getEditorState(), govbbFormEditor, editor)).toEqual(
          exported,
        );
        expect(editor.getEditorState().toJSON()).toEqual(before);
      } finally {
        editor.dispose();
      }
    });

  test("editing real nodes and controls changes JSON while identities and typed literals stay stable", () => {
    const result = formSchemaToLexical(basicNativeForm, govbbFormEditor);
    expect(result.status).toBe("ready");

    if (result.status !== "ready") return;
    const editor = createHeadlessEditor(govbbFormEditor, result.state);

    try {
      editor.update(
        () => {
          const label = $getRoot()
            .getChildren()
            .find((node) => $isQuestionNode(node) && $native(node).owner === "name");

          if ($isQuestionNode(label)) label.clear().append($createTextNode("Your full name"));

          const answer = $getRoot()
            .getChildren()
            .find((node) => $native(node).question?.id === "name")!;

          $updateSettings(answer, { required: true, width: "short" });
          const page = $getRoot().getChildren().find($isPageTitleNode)!;
          page.clear().append($createTextNode("Tell us about yourself"));
        },
        { discrete: true },
      );
      const result = lexicalToFormSchema(editor.getEditorState(), govbbFormEditor, editor);
      expect(result.status).toBe("ready");
      const question = result.schema?.blocks.find((block) => block.id === "name");
      expect(question).toMatchObject({
        id: "name",
        key: "firstName",
        label: "Your full name",
        required: { value: true, message: "Enter your name" },
        default: "",
        config: { width: "short" },
      });
      expect(result.schema?.blocks[0]).toMatchObject({ title: "Tell us about yourself" });
      expect(result.schema?.blocks[2]).toMatchObject({
        options: [
          { id: "one", value: 0, label: "Zero" },
          { id: "two", value: 2, label: "Two" },
        ],
      });
    } finally {
      editor.dispose();
    }
  });

  test("rejects future formats and preserves the original object", () => {
    const original = { ...basicNativeForm, schemaVersion: 3 };
    const result = formSchemaToLexical(original, govbbFormEditor);
    expect(result.status).toBe("blocked");

    if (result.status === "blocked") expect(result.recovery.original).toBe(original);
  });
});
