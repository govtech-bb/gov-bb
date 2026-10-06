import { createEditor } from "../helpers/default-form";
import { LinkNode } from "@lexical/link";
import { HeadingNode } from "@lexical/rich-text";
import { expect, test } from "vitest";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  REDO_COMMAND,
  UNDO_COMMAND,
} from "lexical";
import { $duplicateBlocks, $duplicateQuestion } from "../../src/forms/editor/structure/blocks";
import { registerEditorHistory } from "../../src/editor/core/history";
import { compileForm } from "../helpers/default-form";
import { fromEditor, readMarkdown, toEditor, writeMarkdown } from "../helpers/default-form";
import {
  $createMentionNode,
  $isMentionNode,
  $mentionField,
  MentionNode,
} from "../../src/forms/features/mentions/node";
import { $blockId, $setSettings, $settings } from "../../src/editor/core/document-state";
import {
  $blockKind,
  $createFormTitleNode,
  $createPageTitleNode,
  $createQuestionNode,
  $ensureBlockIds,
  $ensureQuestionFields,
  $isQuestionNode,
  $questionKey,
  $shareQuestionSettings,
} from "../../src/forms/editor/nodes";
import {
  $createOptionNode,
  $createWidgetNode,
  $isOptionNode,
  type ChoiceKind,
} from "../../src/forms/editor/answer-nodes";
import { formNodes } from "../helpers/default-form";
import { $ssbIds } from "../../src/forms/editor/ssb";

const makeEditor = () =>
  createEditor({
    nodes: [...formNodes, HeadingNode, LinkNode, MentionNode],
    onError: (error) => {
      throw error;
    },
  });

const settle = () => {
  $ensureBlockIds($getRoot());
  $shareQuestionSettings($getRoot());
  $ensureQuestionFields($getRoot());
};

const fields = (editor: ReturnType<typeof makeEditor>) =>
  compileForm(editor.getEditorState())
    .pages.flatMap((page) => page.blocks)
    .filter((block) => block.type === "question");

function $question(kind: ChoiceKind = "multiple-choice") {
  const title = $createQuestionNode().append($createTextNode("Permission"));

  const yes = $setSettings($createOptionNode(kind).append($createTextNode("Yes")), {
    fieldId: "permission-answer",
    optionValue: "approved",
  });

  const no = $setSettings($createOptionNode(kind).append($createTextNode("No")), {
    optionValue: "declined",
  });

  return { title, yes, no, nodes: [title, yes, no] };
}

test("whole-question duplication keeps custom choice values through undo, redo and Markdown", async () => {
  for (const kind of ["multiple-choice", "checkboxes", "dropdown"] as const) {
    const editor = makeEditor();
    editor.update(
      () => {
        $getRoot().append(
          $setSettings($createFormTitleNode(), { logicVersion: 2 }),
          $createPageTitleNode(),
          ...$question(kind).nodes,
        );
        settle();
      },
      { discrete: true },
    );
    const unregister = registerEditorHistory(editor);
    editor.update(
      () => {
        $duplicateQuestion($getRoot().getChildren().find($isQuestionNode)!);
        settle();
      },
      { discrete: true },
    );

    const original = fields(editor)[0]!,
      copy = fields(editor)[1]!;

    expect([original.fieldId, copy.fieldId]).toEqual(["permission-answer", "permission"]);
    expect(copy.id).not.toBe(original.id);
    expect(
      copy.options
        .map((option) => option.id)
        .some((id) => original.options.some((option) => option.id === id)),
    ).toBe(false);
    expect(copy.options.map((option) => option.value)).toEqual(["approved", "declined"]);
    expect(original.options.map((option) => option.value)).toEqual(["approved", "declined"]);
    editor.dispatchCommand(UNDO_COMMAND, undefined);
    await Promise.resolve();
    expect(fields(editor)).toHaveLength(1);
    editor.dispatchCommand(REDO_COMMAND, undefined);
    await Promise.resolve();
    expect(fields(editor).map((field) => field.options.map((option) => option.value))).toEqual([
      ["approved", "declined"],
      ["approved", "declined"],
    ]);
    const source = writeMarkdown(fromEditor(editor.getEditorState().toJSON()));
    const parsed = readMarkdown(source);
    expect(parsed.diagnostics.filter((issue) => issue.severity === "fatal")).toEqual([]);
    const loaded = makeEditor();
    loaded.setEditorState(loaded.parseEditorState(toEditor(parsed.document!)));
    expect(fields(loaded).map((field) => field.options.map((option) => option.value))).toEqual([
      ["approved", "declined"],
      ["approved", "declined"],
    ]);
    unregister();
  }
});

test("a selected folded page keeps local values while regenerating IDs and remapping logic and mentions", () => {
  const editor = makeEditor();
  editor.update(
    () => {
      const page = $setSettings($createWidgetNode("page-break"), {
        pageId: "permissions",
        folded: true,
      });

      const question = $question();
      const line = $createParagraphNode();
      const logic = $createWidgetNode("conditional-logic");
      $getRoot().append(
        $setSettings($createFormTitleNode(), { logicVersion: 2 }),
        $createPageTitleNode(),
        page,
        $createPageTitleNode().append($createTextNode("Permissions")),
        ...question.nodes,
        line,
        logic,
      );
      settle();
      line.append($createMentionNode($questionKey(question.yes), "Permission"));
      $setSettings(logic, {
        conditionals: [
          {
            id: "condition",
            type: "SINGLE",
            field: $questionKey(question.yes),
            comparison: "IS",
            value: $blockId(question.yes),
          },
        ],
        actions: [
          { id: "action", type: "REQUIRE_ANSWER", requireAnswer: $questionKey(question.yes) },
        ],
      });
      $duplicateBlocks([page]);
      settle();
      const blocks = $getRoot().getChildren();
      const ids = blocks.map($blockId);
      expect(new Set(ids).size).toBe(ids.length);
      const pages = blocks.filter((node) => $blockKind(node) === "page-break");
      expect(pages).toHaveLength(2);
      expect($settings(pages[0]!).pageId).toBe("permissions");
      expect($settings(pages[1]!).pageId).toBeUndefined();
      const copiedYes = blocks.filter($isOptionNode)[2]!;
      expect($questionKey(copiedYes)).not.toBe($questionKey(question.yes));
      const copiedLogic = blocks.filter((node) => $blockKind(node) === "conditional-logic")[1]!;
      expect($settings(copiedLogic).conditionals).toMatchObject([
        { field: $questionKey(copiedYes), value: $blockId(copiedYes) },
      ]);
      expect($settings(copiedLogic).actions).toMatchObject([
        { requireAnswer: $questionKey(copiedYes) },
      ]);
      const mentions = $getRoot().getAllTextNodes().filter($isMentionNode);
      expect(mentions.map($mentionField)).toEqual([
        $questionKey(question.yes),
        $questionKey(copiedYes),
      ]);
    },
    { discrete: true },
  );
  expect(fields(editor).map((field) => field.options.map((option) => option.value))).toEqual([
    ["approved", "declined"],
    ["approved", "declined"],
  ]);
});

test("copying an individual option within its question still avoids duplicate submitted values", () => {
  const editor = makeEditor();
  editor.update(
    () => {
      const question = $question();
      $setSettings(question.yes, { optionValue: "yes" });
      $getRoot().append($createFormTitleNode(), $createPageTitleNode(), ...question.nodes);
      settle();
      $duplicateBlocks([question.yes]);
      settle();
      const options = $getRoot().getChildren().filter($isOptionNode);
      expect(options.map((option) => $questionKey(option))).toEqual(
        options.map(() => $questionKey(question.yes)),
      );
      expect(options.map((option) => $ssbIds().options.get(option.getKey())?.id)).toEqual([
        "yes",
        "yes-2",
        "declined",
      ]);
      expect($settings(options[0]!).optionValue).toBe("yes");
      expect($settings(options[1]!).optionValue).toBeUndefined();
    },
    { discrete: true },
  );
});

test("whole untitled choice duplication creates an independent question with its values and undo boundary", async () => {
  const editor = makeEditor();
  editor.update(
    () => {
      const question = $question();
      $getRoot().append($createFormTitleNode(), $createPageTitleNode(), question.yes, question.no);
      settle();
    },
    { discrete: true },
  );
  const original = fields(editor)[0]!;
  const unregister = registerEditorHistory(editor);
  editor.update(
    () => {
      $duplicateQuestion($getRoot().getChildren().find($isOptionNode)!);
      settle();
      const options = $getRoot().getChildren().filter($isOptionNode);
      expect(options).toHaveLength(4);
      expect(new Set(options.map($questionKey)).size).toBe(2);
      expect(options.map((option) => $ssbIds().options.get(option.getKey())?.id)).toEqual([
        "approved",
        "declined",
        "approved",
        "declined",
      ]);
      expect(
        $getRoot()
          .getChildren()
          .filter($isQuestionNode)
          .map((node) => node.getTextContent()),
      ).toEqual([""]);
    },
    { discrete: true },
  );
  const copy = fields(editor)[1]!;
  expect(copy.id).not.toBe(original.id);
  expect(
    copy.options
      .map((option) => option.id)
      .some((id) => original.options.some((option) => option.id === id)),
  ).toBe(false);
  editor.dispatchCommand(UNDO_COMMAND, undefined);
  await Promise.resolve();
  expect(fields(editor).map((field) => field.id)).toEqual([original.id]);
  editor
    .getEditorState()
    .read(() => expect($getRoot().getChildren().filter($isQuestionNode)).toHaveLength(0), {
      editor: editor,
    });
  editor.dispatchCommand(REDO_COMMAND, undefined);
  await Promise.resolve();
  expect(
    fields(editor).map((field) => [field.id, field.options.map((option) => option.value)]),
  ).toEqual([
    [original.id, ["approved", "declined"]],
    [copy.id, ["approved", "declined"]],
  ]);
  unregister();
});
