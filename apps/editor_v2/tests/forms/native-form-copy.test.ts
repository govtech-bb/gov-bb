import { expect, test } from "vitest";
import { $getRoot, UNDO_COMMAND, REDO_COMMAND } from "lexical";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import { registerEditorHistory } from "../../src/editor/core/history";
import { govbbFormEditor } from "../../src/presets/govbb-form";
import { formSchemaToLexical } from "../../src/converters/formSchemaToLexical";
import { lexicalToFormSchema } from "../../src/converters/lexicalToFormSchema";
import { lexicalToMarkdown } from "../../src/converters/lexicalToMarkdown";
import { markdownToLexical } from "../../src/converters/markdownToLexical";
import {
  $duplicateBlocks,
  $duplicateQuestion,
  $removeBlocks,
  $restoreCopiedOptionValues,
} from "../../src/forms/editor/structure/blocks";
import { $native } from "../../src/forms/editor/native-state";
import { $deepCopy, $isQuestionNode, $setSettings } from "../../src/forms/editor/nodes";
import { $remapCopies } from "../../src/forms/features/mentions/editor";
import { $nativeTargets } from "../../src/forms/features/logic/native-authoring";
import type { AnyFormDefinition, QuestionBase } from "../../src/forms/schema";
import repeat from "../fixtures/forms/v2/examples/repeat-example.json";

function example(): AnyFormDefinition {
  return {
    schemaVersion: 2,
    id: "copy-test",
    title: "Copy",
    mode: "application",
    locale: "en-BB",
    timeZone: "America/Barbados",
    settings: { visibility: "draft", hiddenAnswers: "retain" },
    blocks: [
      { id: "page", type: "page", role: "questions", title: "Details" },
      {
        id: "choice",
        type: "question",
        kind: "choice",
        key: "choice",
        label: "Choice",
        hint: [{ id: "hint", type: "content", kind: "paragraph", content: "Helpful text" }],
        config: { selection: "single" },
        options: [
          { id: "first", value: 0, label: "Zero" },
          { id: "second", value: 5, label: "Five" },
        ],
      },
    ],
  };
}

function setup(form: AnyFormDefinition | typeof repeat = example()) {
  const result = formSchemaToLexical(form, govbbFormEditor);
  expect(result.diagnostics).toEqual([]);

  if (result.status !== "ready") throw Error("Import failed");

  return createHeadlessEditor(govbbFormEditor, result.state);
}

function exported(editor: ReturnType<typeof setup>) {
  const result = lexicalToFormSchema(editor.getEditorState(), govbbFormEditor, editor);
  expect(result.diagnostics).toEqual([]);

  if (result.status !== "ready") throw Error("Export failed");

  return result.schema;
}

const questions = (form: AnyFormDefinition) =>
  form.blocks.filter((block): block is QuestionBase => block.type === "question");

test("native whole-question copies preserve typed values and hints, with one undo and stable Markdown reload", async () => {
  const editor = setup(),
    unregister = registerEditorHistory(editor);

  try {
    editor.update(() => $duplicateQuestion($getRoot().getChildren().find($isQuestionNode)!), {
      discrete: true,
    });

    const form = exported(editor),
      [original, copy] = questions(form);

    expect(copy?.id).not.toBe(original?.id);
    expect(copy?.key).toBe("choice-2");
    expect(copy?.options?.map((option) => option.value)).toEqual([0, 5]);
    expect(copy?.hint).toMatchObject([{ content: "Helpful text" }]);
    const hint = copy?.hint;

    if (!Array.isArray(hint) || !hint[0] || typeof hint[0] === "string" || !("id" in hint[0]))
      throw Error("Expected copied block hint");
    expect(hint[0].id).not.toBe("hint");
    editor.dispatchCommand(UNDO_COMMAND, undefined);
    await Promise.resolve();
    expect(questions(exported(editor))).toHaveLength(1);
    editor.dispatchCommand(REDO_COMMAND, undefined);
    await Promise.resolve();
    expect(questions(exported(editor))[1]).toEqual(copy);

    const markdown = lexicalToMarkdown(editor.getEditorState().toJSON(), govbbFormEditor),
      parsed = markdownToLexical(markdown, govbbFormEditor);

    expect(parsed.state).toBeDefined();
    const reloaded = createHeadlessEditor(govbbFormEditor, parsed.state!);

    try {
      expect(questions(exported(reloaded))).toEqual([original!, copy!]);
    } finally {
      reloaded.dispose();
    }
  } finally {
    unregister();
    editor.dispose();
  }
});

test("a single copied option stays in its question and allocates a distinct value of the same type", () => {
  const editor = setup();

  try {
    editor.update(
      () =>
        $duplicateBlocks([
          $getRoot()
            .getChildren()
            .find((node) => $native(node).option?.id === "first")!,
        ]),
      { discrete: true },
    );

    const form = exported(editor),
      [question] = questions(form);

    expect(questions(form)).toHaveLength(1);
    expect(question?.id).toBe("choice");
    expect(question?.key).toBe("choice");
    expect(question?.options?.map((option) => option.value)).toEqual([0, 1, 5]);
    expect(new Set(question?.options?.map((option) => option.id)).size).toBe(3);
  } finally {
    editor.dispose();
  }
});

test("pasting an option into another question adopts its identity and allocates a value against its options", async () => {
  const form = example();
  form.blocks.push({
    id: "destination",
    type: "question",
    kind: "choice",
    key: "destination",
    label: "Destination",
    config: { selection: "single" },
    options: [
      { id: "destination-first", value: 0, label: "Zero" },
      { id: "destination-second", value: 1, label: "One" },
    ],
  });

  const editor = setup(form),
    unregister = registerEditorHistory(editor),
    before = exported(editor);

  try {
    editor.update(
      () => {
        const nodes = $getRoot().getChildren(),
          original = nodes.find((node) => $native(node).option?.id === "first")!,
          destination = nodes.find((node) => $native(node).option?.id === "destination-second")!,
          copy = $deepCopy(original);

        destination.insertAfter(copy);
        $restoreCopiedOptionValues([[original, copy]]);
        $remapCopies([[original, copy]]);
        expect($native(copy).question?.id).toBe("destination");
        expect($native(copy).question?.key).toBe("destination");
        expect($native(copy).owner).toBe("destination");
        expect($native(copy).option?.id).not.toBe("first");
        expect($native(copy).option?.value).toBe(2);
      },
      { discrete: true },
    );

    const after = exported(editor),
      [original, destination] = questions(after);

    expect(questions(after)).toHaveLength(2);
    expect(original).toEqual(questions(before)[0]);
    expect(destination?.id).toBe("destination");
    expect(destination?.key).toBe("destination");
    expect(destination?.options?.map((option) => option.value)).toEqual([0, 1, 2]);
    expect(destination?.options?.slice(0, 2)).toEqual(questions(before)[1]?.options);
    editor.dispatchCommand(UNDO_COMMAND, undefined);
    await Promise.resolve();
    expect(exported(editor)).toEqual(before);
    editor.dispatchCommand(REDO_COMMAND, undefined);
    await Promise.resolve();
    expect(exported(editor)).toEqual(after);

    const markdown = lexicalToMarkdown(editor.getEditorState().toJSON(), govbbFormEditor),
      parsed = markdownToLexical(markdown, govbbFormEditor);

    expect(parsed.state).toBeDefined();
    const reloaded = createHeadlessEditor(govbbFormEditor, parsed.state!);

    try {
      expect(exported(reloaded)).toEqual(after);
    } finally {
      reloaded.dispose();
    }
  } finally {
    unregister();
    editor.dispose();
  }
});

test("deleting the first option keeps logical question identity and metadata on remaining options", () => {
  const editor = setup();

  try {
    editor.update(
      () =>
        $removeBlocks([
          $getRoot()
            .getChildren()
            .find((node) => $native(node).option?.id === "first")!,
        ]),
      { discrete: true },
    );
    expect(questions(exported(editor))[0]).toMatchObject({
      id: "choice",
      key: "choice",
      options: [{ id: "second", value: 5 }],
    });
  } finally {
    editor.dispose();
  }
});

test("repeated page copies keep local answer keys while remapping local and preserving explicit form references", () => {
  const editor = setup(repeat);

  try {
    editor.update(
      () => {
        const page = $getRoot()
          .getChildren()
          .find((node) => $native(node).page?.id === "household-members-page")!;

        $setSettings(page, { folded: true });
        $duplicateBlocks([page]);
      },
      { discrete: true },
    );

    const form = exported(editor),
      pages = form.blocks.filter((block) => block.type === "page" && block.repeat);

    expect(pages).toHaveLength(2);
    expect(pages[1]).toMatchObject({ repeat: { key: "members-2" } });

    const originalIndex = form.blocks.indexOf(pages[0]!),
      copiedIndex = form.blocks.indexOf(pages[1]!);

    const originalNames = form.blocks
      .slice(originalIndex + 1, copiedIndex)
      .filter((block): block is QuestionBase => block.type === "question")
      .map((block) => block.key);

    const copiedQuestions = form.blocks
      .slice(copiedIndex + 1)
      .filter((block): block is QuestionBase => block.type === "question");

    expect(copiedQuestions.map((block) => block.key)).toEqual(originalNames);
    expect(
      copiedQuestions.every(
        (block) =>
          !["member-name", "member-no-national-id", "member-national-id", "member-phones"].includes(
            block.id,
          ),
      ),
    ).toBe(true);
    const copiedLogic = form.blocks.slice(copiedIndex + 1).find((block) => block.type === "logic");
    expect(JSON.stringify(copiedLogic)).toContain(
      '"answer":"include-phone-numbers","scope":"form"',
    );
    expect(JSON.stringify(copiedLogic)).not.toContain('"answer":"member-no-national-id"');
  } finally {
    editor.dispose();
  }
});

test("accordion copies remap inline options and expose them to conditional targets", () => {
  const form = example();
  const question = questions(form)[0]!;
  question.config = {
    selection: "multiple",
    presentation: "accordion",
    groups: [{ id: "group", label: "Group", higherRisk: false, optionIds: ["first", "second"] }],
  };
  const editor = setup(form);

  try {
    editor.update(() => $duplicateQuestion($getRoot().getChildren().find($isQuestionNode)!), {
      discrete: true,
    });
    const [original, copy] = questions(exported(editor));
    expect(copy?.options?.map((option) => option.value)).toEqual([0, 5]);
    expect(copy?.options?.map((option) => option.id)).not.toEqual(
      original?.options?.map((option) => option.id),
    );
    expect(copy?.config).toMatchObject({
      groups: [{ higherRisk: false, optionIds: copy?.options?.map((option) => option.id) }],
    });
    editor.getEditorState().read(
      () => {
        const targets = $nativeTargets();
        expect(
          targets.questions
            .find((target) => target.value === copy?.id)
            ?.options.map((option) => option.value),
        ).toEqual(copy?.options?.map((option) => option.id));
      },
      { editor },
    );
  } finally {
    editor.dispose();
  }
});
