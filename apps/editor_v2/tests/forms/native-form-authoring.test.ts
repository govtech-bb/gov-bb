import { expect, test } from "vitest";
import { $createTextNode, $getRoot } from "lexical";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import { govbbFormEditor } from "../../src/presets/govbb-form";
import { formSchemaToLexical } from "../../src/converters/formSchemaToLexical";
import { lexicalToFormSchema } from "../../src/converters/lexicalToFormSchema";
import { lexicalToMarkdown } from "../../src/converters/lexicalToMarkdown";
import { markdownToLexical } from "../../src/converters/markdownToLexical";
import { $native } from "../../src/forms/editor/native-state";
import {
  $createQuestionNode,
  $createPageTitleNode,
  $isQuestionNode,
  $setSettings,
  $turnInto,
} from "../../src/forms/editor/nodes";
import { $createOptionNode, $createWidgetNode } from "../../src/forms/editor/answer-nodes";
import { checkboxAccordionInsertion } from "../../src/forms/features/checkbox-accordion/insertion";
import { openingHoursEntry } from "../../src/forms/features/opening-hours/insertion";
import { $settings } from "../../src/editor/core/document-state";
import { $createDrawnInput } from "../../src/forms/editor/field-nodes";
import type { AnyFormDefinition, QuestionBase } from "../../src/forms/schema";

const form: AnyFormDefinition = {
  schemaVersion: 2,
  id: "authoring",
  title: "Authoring",
  mode: "application",
  locale: "en-BB",
  timeZone: "America/Barbados",
  settings: { visibility: "preview", hiddenAnswers: "retain" },
  blocks: [
    { id: "page", type: "page", role: "questions", title: "First page" },
    { id: "original", type: "question", kind: "text", key: "name", label: "Name" },
    {
      id: "score",
      type: "calculated",
      valueType: "number",
      key: "amount",
      submit: true,
      expression: 0,
    },
  ],
};

function setup(value: AnyFormDefinition = form) {
  const imported = formSchemaToLexical(value, govbbFormEditor);

  if (imported.status !== "ready") throw Error(JSON.stringify(imported.diagnostics));

  return createHeadlessEditor(govbbFormEditor, imported.state);
}

function exported(editor: ReturnType<typeof setup>) {
  const result = lexicalToFormSchema(editor.getEditorState(), govbbFormEditor, editor);
  expect(result.diagnostics).toEqual([]);

  if (result.status !== "ready") throw Error("Export failed");

  return result.schema;
}

const questions = (value: AnyFormDefinition) =>
  value.blocks.filter((block): block is QuestionBase => block.type === "question");

test("new native questions use unique submitted keys including calculated keys, then retain identities after label edits", () => {
  const editor = setup();

  try {
    editor.update(
      () => {
        $getRoot().append(
          $createQuestionNode().append($createTextNode("Amount")),
          $createDrawnInput("number"),
        );
      },
      { discrete: true },
    );
    const before = questions(exported(editor)).at(-1)!;
    expect(before.key).toBe("amount-2");
    expect(before.kind).toBe("number");
    editor.update(
      () => {
        const label = $getRoot()
          .getChildren()
          .find((node) => $isQuestionNode(node) && $native(node).owner === before.id)!;

        if ($isQuestionNode(label)) label.clear().append($createTextNode("Annual amount"));
      },
      { discrete: true },
    );
    expect(questions(exported(editor)).at(-1)).toMatchObject({
      id: before.id,
      key: "amount-2",
      label: "Annual amount",
    });
    const snapshot = editor.getEditorState().toJSON();
    exported(editor);
    exported(editor);
    expect(editor.getEditorState().toJSON()).toEqual(snapshot);
  } finally {
    editor.dispose();
  }
});

test("new repeat pages own local submitted keys and preserve navigation and repeat configuration", () => {
  const editor = setup();

  try {
    editor.update(
      () => {
        $getRoot().append(
          $setSettings($createWidgetNode("page-break"), {
            repeatable: { min: 0, max: 3, addAnotherLabel: "Add member", instanceLabel: "Member" },
            button: "Next member",
            backButton: "Back",
          }),
          $createPageTitleNode().append($createTextNode("Member")),
          $createQuestionNode().append($createTextNode("Name")),
          $createDrawnInput("text"),
        );
      },
      { discrete: true },
    );

    const value = exported(editor),
      page = value.blocks.find((block) => block.type === "page" && block.repeat);

    expect(page).toMatchObject({
      repeat: { min: 0, max: 3, addLabel: "Add member", itemLabel: "Member" },
      navigation: { nextLabel: "Next member", backLabel: "Back" },
    });
    expect(questions(value).map((question) => question.key)).toEqual(["name", "name"]);
  } finally {
    editor.dispose();
  }
});

test("new options allocate stable values and changing presentation updates the same question", () => {
  const value: AnyFormDefinition = structuredClone(form);
  value.blocks.push({
    id: "choice",
    type: "question",
    kind: "choice",
    key: "choice",
    label: "Choice",
    config: { selection: "single" },
    default: 3,
    options: [
      { id: "a", label: "Three", value: 3 },
      { id: "b", label: "Zero", value: 0 },
    ],
  });
  const editor = setup(value);

  try {
    editor.update(
      () =>
        $getRoot().append(
          $createOptionNode("multiple-choice").append($createTextNode("New number")),
        ),
      { discrete: true },
    );
    const before = questions(exported(editor)).at(-1)!;
    expect(before.options?.map((option) => option.value)).toEqual([3, 0, 1]);
    editor.update(
      () =>
        $turnInto(
          $getRoot()
            .getChildren()
            .find((node) => $native(node).option?.id === "a")!,
          "checkboxes",
        ),
      { discrete: true },
    );
    const after = questions(exported(editor)).at(-1)!;
    expect(after).toMatchObject({
      id: "choice",
      key: "choice",
      config: { selection: "multiple", presentation: "checkboxes" },
      default: [3],
    });
    expect(after.options).toEqual(before.options);
  } finally {
    editor.dispose();
  }
});

test("unfinished native logic remains visible and Markdown-saveable while runnable export is blocked", () => {
  const editor = setup();

  try {
    editor.update(() => $getRoot().append($createWidgetNode("conditional-logic")), {
      discrete: true,
    });
    const value = lexicalToFormSchema(editor.getEditorState(), govbbFormEditor, editor);
    expect(value.status).toBe("blocked");
    expect(value.diagnostics.some((issue) => issue.code === "array-length")).toBe(true);

    const markdown = lexicalToMarkdown(editor.getEditorState().toJSON(), govbbFormEditor),
      parsed = markdownToLexical(markdown, govbbFormEditor);

    expect(parsed.diagnostics.filter((issue) => issue.severity === "fatal")).toEqual([]);
    expect(parsed.state).toBeDefined();
    const loaded = createHeadlessEditor(govbbFormEditor, parsed.state!);

    try {
      expect(lexicalToFormSchema(loaded.getEditorState(), govbbFormEditor, loaded).status).toBe(
        "blocked",
      );
    } finally {
      loaded.dispose();
    }
  } finally {
    editor.dispose();
  }
});

test("new decorator questions project stable keys and accordion defaults before Markdown persistence", () => {
  const editor = setup();

  try {
    editor.update(
      () => {
        $getRoot().append(
          $createQuestionNode().append($createTextNode("Office opening hours")),
          ...openingHoursEntry.create(),
        );
        $getRoot().append(
          $createQuestionNode().append($createTextNode("Services offered")),
          ...checkboxAccordionInsertion.create(),
        );
      },
      { discrete: true },
    );

    const before = exported(editor),
      added = questions(before).slice(-2);

    expect(added.map((question) => question.key)).toEqual([
      "office-opening-hours",
      "services-offered",
    ]);
    expect(added[1]!.options?.map((option) => option.label)).toEqual(["Option 1", "Option 2"]);
    expect(added[1]!.options?.map((option) => option.value)).toEqual(["option-1", "option-2"]);
    expect(added[1]!.config).toMatchObject({
      selection: "multiple",
      presentation: "accordion",
      groups: [{ label: "Category", optionIds: added[1]!.options!.map((option) => option.id) }],
    });
    editor.read(() => {
      for (const node of $getRoot().getChildren())
        if (added.some((question) => question.id === $native(node).question?.id))
          expect($settings(node).fieldId).toBe($native(node).question!.key);
    });

    const source = lexicalToMarkdown(editor.getEditorState().toJSON(), govbbFormEditor),
      parsed = markdownToLexical(source, govbbFormEditor);

    expect(parsed.diagnostics.filter((issue) => issue.severity === "fatal")).toEqual([]);
    expect(parsed.state).toBeDefined();
    const loaded = createHeadlessEditor(govbbFormEditor, parsed.state!);

    try {
      expect(exported(loaded)).toEqual(before);
    } finally {
      loaded.dispose();
    }
  } finally {
    editor.dispose();
  }
});
