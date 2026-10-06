import { expect, test } from "vitest";
import { $createTextNode, $getRoot } from "lexical";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import { $settings, $setSettings } from "../../src/editor/core/document-state";
import { $createNumberNode } from "../../src/editor/modules/lists/nodes";
import { $createDrawnInput } from "../../src/forms/editor/field-nodes";
import { $describe } from "../../src/forms/react/gutter";
import { $createFormTitleNode } from "../../src/forms/editor/nodes";
import { govbbFormEditor } from "../../src/presets/govbb-form";
import { lexicalToMarkdown } from "../../src/converters/lexicalToMarkdown";
import { markdownToLexical } from "../../src/converters/markdownToLexical";

test("Number input and numbered list have distinct menu roles while source retains opaque list settings", () => {
  const editor = createHeadlessEditor(govbbFormEditor);

  let inputKey = "",
    listKey = "";

  try {
    editor.update(
      () => {
        const input = $createDrawnInput("number", { required: true });

        const list = $setSettings($createNumberNode().append($createTextNode("Bring evidence")), {
          step: 7,
        });

        $getRoot()
          .clear()
          .append($createFormTitleNode().append($createTextNode("Menu ownership")), input, list);
        govbbFormEditor.$normalizeInitial();
        inputKey = input.getKey();
        listKey = list.getKey();
      },
      { discrete: true },
    );

    const models = editor
      .getEditorState()
      .read(() => [$describe(inputKey)!.menu, $describe(listKey)!.menu], { editor });

    expect(models[0]!.header).toBeDefined();
    expect(models[1]!.header).toBeUndefined();

    const source = lexicalToMarkdown(editor.getEditorState().toJSON(), govbbFormEditor);
    const parsed = markdownToLexical(source, govbbFormEditor);
    expect(parsed.diagnostics.filter((issue) => issue.severity === "fatal")).toEqual([]);
    expect(parsed.diagnostics.some((issue) => issue.code === "native-preparation")).toBe(true);
    expect(parsed.state).toBeDefined();
    const restored = createHeadlessEditor(govbbFormEditor, parsed.state!);

    try {
      restored.getEditorState().read(
        () => {
          const list = $getRoot()
            .getChildren()
            .find((node) => node.getType() === "number")!;

          expect(list.getTextContent()).toBe("Bring evidence");
          expect($settings(list).step).toBe(7);
        },
        { editor: restored },
      );
    } finally {
      restored.dispose();
    }
  } finally {
    editor.dispose();
  }
});
