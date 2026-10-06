import { nativeDefinition } from "../helpers/native-definition";
import { expect, test } from "vitest";
import { $createTextNode, $getRoot, $isElementNode, $setState, createState } from "lexical";
import { $setSettings as $setRawSettings } from "../../src/editor/core/document-state";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import { govbbFormEditor } from "../../src/presets/govbb-form";
import { formSchemaToLexical } from "../../src/converters/formSchemaToLexical";
import { lexicalToFormSchema } from "../../src/converters/lexicalToFormSchema";
import { lexicalToMarkdown } from "../../src/converters/lexicalToMarkdown";
import { markdownToLexical } from "../../src/converters/markdownToLexical";
import { $native, rawNative } from "../../src/forms/editor/native-state";
import { $setFormSettings, nativeQuestionSettings } from "../../src/forms/editor/native-settings";
import { $depth, $setDepth, $updateSettings, listIndexState } from "../../src/forms/editor/nodes";
import { nativeSemanticEqual } from "../../src/forms/schema/semantics";

import fixture from "../fixtures/forms/v2/bindings.json";

const form = nativeDefinition(fixture);

function editorFor(value = form) {
  const result = formSchemaToLexical(value, govbbFormEditor);
  expect(result.diagnostics).toEqual([]);

  if (result.status !== "ready") throw new Error("Import was blocked");

  return createHeadlessEditor(govbbFormEditor, result.state);
}

function exportForm(editor: ReturnType<typeof editorFor>) {
  const result = lexicalToFormSchema(editor.getEditorState(), govbbFormEditor, editor);
  expect(result.diagnostics).toEqual([]);
  expect(result.status).toBe("ready");

  return result.schema!;
}

test("every installed native field and rich content binding preserves editable meaning", () => {
  const editor = editorFor();

  try {
    const exported = exportForm(editor);

    // Option-followup layout changes visual order, while semantic reading order keeps its owner first.
    for (const block of form.blocks)
      expect(
        nativeSemanticEqual(
          exported.blocks.find((item) => item.id === block.id),
          block,
        ),
      ).toBe(true);
    expect(exported.blocks).toHaveLength(form.blocks.length);
    editor.read(() => {
      const input = $getRoot()
        .getChildren()
        .find((node) => $native(node).question?.id === "nested")!;

      expect($depth(input)).toBe(1);
    });
  } finally {
    editor.dispose();
  }
});

test("all native field and structured content bindings survive the Markdown persistence boundary", () => {
  const editor = editorFor();

  try {
    const source = lexicalToMarkdown(editor.getEditorState().toJSON(), govbbFormEditor);
    const parsed = markdownToLexical(source, govbbFormEditor);
    expect(parsed.diagnostics.filter((issue) => issue.severity === "fatal")).toEqual([]);
    expect(parsed.state).toBeDefined();

    if (!parsed.state) return;
    const reopened = createHeadlessEditor(govbbFormEditor, parsed.state);

    try {
      expect(nativeSemanticEqual(exportForm(reopened), form)).toBe(true);
    } finally {
      reopened.dispose();
    }
  } finally {
    editor.dispose();
  }
});

test("generic paragraph and heading layout hosts survive the actual Markdown codec", () => {
  const value = structuredClone(form);
  value.blocks.splice(value.blocks.findIndex((block) => block.id === "paragraph") + 1, 0, {
    id: "under-paragraph",
    type: "content",
    kind: "paragraph",
    content: "Nested under a paragraph",
    layout: { under: { block: "paragraph" } },
  });
  value.blocks.splice(value.blocks.findIndex((block) => block.id === "heading") + 1, 0, {
    id: "under-heading",
    type: "content",
    kind: "paragraph",
    content: "Nested under a heading",
    layout: { under: { block: "heading" } },
  });
  const editor = editorFor(value);

  try {
    const source = lexicalToMarkdown(editor.getEditorState().toJSON(), govbbFormEditor);
    const parsed = markdownToLexical(source, govbbFormEditor);
    expect(parsed.diagnostics.filter((issue) => issue.severity === "fatal")).toEqual([]);
    expect(parsed.state).toBeDefined();

    if (!parsed.state) return;
    const reopened = createHeadlessEditor(govbbFormEditor, parsed.state);

    try {
      expect(nativeSemanticEqual(exportForm(reopened), value)).toBe(true);
      expect(lexicalToMarkdown(reopened.getEditorState().toJSON(), govbbFormEditor)).toBe(source);
    } finally {
      reopened.dispose();
    }
  } finally {
    editor.dispose();
  }
});

test("question-to-question layout anchors remain explicitly unsupported", () => {
  const value = structuredClone(form);
  value.blocks.splice(value.blocks.findIndex((block) => block.id === "text") + 1, 0, {
    id: "under-question",
    type: "question",
    kind: "text",
    key: "underQuestion",
    label: "Nested under a question",
    layout: { under: { block: "text" } },
  });
  const result = formSchemaToLexical(value, govbbFormEditor);
  expect(result.status).toBe("blocked");
  expect(result.diagnostics.some((issue) => issue.code === "layout-kind")).toBe(true);
});

test("text edits in structured hints and list introductions are exported exactly once", () => {
  const editor = editorFor();

  try {
    editor.update(
      () => {
        for (const node of $getRoot().getChildren()) {
          if (
            $isElementNode(node) &&
            $native(node).content?.id === "list" &&
            $native(node).part === "list-content"
          )
            node.clear().append($createTextNode("Edited list introduction"));

          if ($isElementNode(node) && $native(node).content?.id === "hint-details")
            node.clear().append($createTextNode("Edited nested help"));
        }
      },
      { discrete: true },
    );
    const exported = exportForm(editor);
    expect(exported.blocks.find((block) => block.id === "list")).toMatchObject({
      content: "Edited list introduction",
    });
    expect(exported.blocks.find((block) => block.id === "rich-hint")).toMatchObject({
      hint: [
        { id: "hint-list" },
        { config: { blocks: [{ config: { blocks: [{ content: "Edited nested help" }] } }] } },
      ],
    });
  } finally {
    editor.dispose();
  }
});

test("native controls write dates, file rules, navigation, rich groups and typed choices", () => {
  const editor = editorFor();

  try {
    editor.update(
      () => {
        for (const node of $getRoot().getChildren()) {
          const native = $native(node);

          if (native.question?.id === "date")
            $updateSettings(node, {
              relativeDate: "futureOrToday",
              hasDefaultAnswer: true,
              defaultAnswer: { field: "utility::today()" },
              specificDates: ["2027-01-01"],
            });

          if (native.question?.id === "file")
            $updateSettings(node, {
              hasMultipleFiles: false,
              allowedFiles: ["image/png"],
              hasMaxFileSize: true,
              maxFileSize: "10",
            });

          if (native.page?.id === "page")
            $setFormSettings(node, { button: "Check answers", backButton: "Back to questions" });

          if (native.question?.id === "accordion")
            $setFormSettings(node, {
              nativeOptions: [
                { id: "choice-a", label: [{ text: "Edited", marks: ["bold"] }], value: 12 },
                { id: "choice-b", label: "Second", value: 13 },
              ],
              nativeGroups: [
                {
                  id: "category",
                  label: "New category",
                  higherRisk: true,
                  optionIds: ["choice-a", "choice-b"],
                },
              ],
            });
        }
      },
      { discrete: true },
    );
    const exported = exportForm(editor);
    expect(exported.blocks[0]).toMatchObject({
      navigation: { nextLabel: "Check answers", backLabel: "Back to questions" },
    });
    expect(exported.blocks.find((block) => block.id === "file")).toMatchObject({
      config: { multiple: false },
      validation: [
        { id: "types", value: ["image/png"], message: "Upload a PDF" },
        { id: "size", value: 10 },
      ],
    });
    expect(exported.blocks.find((block) => block.id === "date")).toMatchObject({
      default: { context: "today" },
      validation: [
        { id: "dates", value: ["2027-01-01"] },
        { type: "dateAfter", value: { context: "today" }, inclusive: true },
      ],
    });
    expect(exported.blocks.find((block) => block.id === "accordion")).toMatchObject({
      options: [{ value: 12, label: [{ text: "Edited", marks: ["bold"] }] }, { value: 13 }],
      config: { groups: [{ label: "New category", higherRisk: true }] },
    });
  } finally {
    editor.dispose();
  }
});

test("moving a followup out updates native layout instead of retaining stale metadata", () => {
  const editor = editorFor();

  try {
    editor.update(
      () => {
        for (const node of $getRoot().getChildren())
          if ($native(node).owner === "nested") $setDepth(node, 0);
      },
      { discrete: true },
    );
    expect(exportForm(editor).blocks.find((block) => block.id === "nested")).not.toHaveProperty(
      "layout",
    );
  } finally {
    editor.dispose();
  }
});

test("moving nested disclosure text out changes containment and derived list numbering is allowed", () => {
  const editor = editorFor();

  try {
    editor.update(
      () => {
        const nodes = $getRoot().getChildren();
        const paragraph = nodes.find((node) => $native(node).content?.id === "inside-paragraph")!;
        const outer = nodes.find((node) => $native(node).content?.id === "paragraph")!;
        outer.insertAfter(paragraph);
        $setDepth(paragraph, 0);
        const item = nodes.find((node) => $native(node).listItem?.id === "hint-item")!;
        $setState(item, listIndexState, 1);
      },
      { discrete: true },
    );
    const result = exportForm(editor);
    expect(result.blocks.find((block) => block.id === "inside-paragraph")).toMatchObject({
      content: "The deepest text",
    });
    expect(result.blocks.find((block) => block.id === "disclosure")).toMatchObject({
      config: {
        blocks: [{ id: "inside-list" }, { id: "inside-disclosure", config: { blocks: [] } }],
      },
    });
  } finally {
    editor.dispose();
  }
});

test("projected rule controls retain date bounds, typed defaults and explicit false", () => {
  const date = form.blocks.find((block) => block.type === "question" && block.id === "date")!;

  if (date.type !== "question") throw Error("Missing date question");
  expect(nativeQuestionSettings(date)).toMatchObject({
    relativeDate: "pastOrToday",
    specificDates: ["2026-10-04"],
    defaultAnswer: { field: "utility::today()" },
  });
  const file = form.blocks.find((block) => block.type === "question" && block.id === "file")!;

  if (file.type !== "question") throw Error("Missing file question");
  expect(nativeQuestionSettings(file)).toMatchObject({
    hasMultipleFiles: true,
    allowedFiles: ["application/pdf"],
    maxFileSize: 5,
  });
  const imported = formSchemaToLexical(form, govbbFormEditor);

  if (imported.status !== "ready") throw new Error("Import was blocked");
  const nodes = imported.state.root.children;
  expect(
    rawNative(nodes.find((node) => rawNative(node).question?.id === "accordion")!).options?.map(
      (option) => option.value,
    ),
  ).toEqual([true, false]);
});

test("unknown authored settings and NodeState stay in the draft and block runnable export", () => {
  for (const kind of ["settings", "state", "inline"] as const) {
    const editor = editorFor();

    try {
      editor.update(
        () => {
          const node = $getRoot()
            .getChildren()
            .find((node) => $native(node).question?.id === "text")!;

          if (kind === "settings")
            $setRawSettings(node, { futureConstraint: { enabled: false, value: 0 } });
          else if (kind === "state")
            $setState(node, createState("futureState", { parse: (value) => value }), {
              enabled: false,
              value: 0,
            });
          else {
            const label = $getRoot()
              .getChildren()
              .find((node) => $native(node).owner === "text" && $native(node).part === "label")!;

            if ($isElementNode(label))
              $setState(
                label.getFirstChild()!,
                createState("futureInline", { parse: (value) => value }),
                0,
              );
          }
        },
        { discrete: true },
      );

      const before = editor.getEditorState().toJSON(),
        result = lexicalToFormSchema(editor.getEditorState(), govbbFormEditor, editor);

      expect(result.status).toBe("blocked");
      expect(
        result.diagnostics.some(
          (issue) => issue.code === "native-binding" || issue.code === "native-text",
        ),
      ).toBe(true);
      expect(editor.getEditorState().toJSON()).toEqual(before);
      expect(JSON.stringify(before)).toContain(
        kind === "settings"
          ? "futureConstraint"
          : kind === "state"
            ? "futureState"
            : "futureInline",
      );
    } finally {
      editor.dispose();
    }
  }
});
