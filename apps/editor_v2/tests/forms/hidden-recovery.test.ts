import { createEditor } from "../helpers/default-form";
import { expect, test } from "vitest";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  REDO_COMMAND,
  UNDO_COMMAND,
} from "lexical";
import { registerEditorHistory } from "../../src/editor/core/history";
import { prepareSource } from "../helpers/default-form";
import { $ruleLinkSources } from "../../src/forms/features/logic/wording-queries";
import {
  $createLogic,
  $hiddenWithoutShow,
  $makeVisibleWithoutShow,
  $setLogicActions,
} from "../../src/forms/features/logic/authoring";
import { fromEditor, readMarkdown, writeMarkdown } from "../helpers/default-form";
import { $blockId, $setSettings, $settings } from "../../src/editor/core/document-state";
import {
  $createFormTitleNode,
  $createPageTitleNode,
  $createQuestionNode,
  $ensureBlockIds,
  $ensureQuestionFields,
  $questionKey,
} from "../../src/forms/editor/nodes";
import {
  $createInputNode,
  $createLongAnswerNode,
  $createOptionNode,
  $createWidgetNode,
} from "../../src/forms/editor/answer-nodes";
import { formNodes } from "../helpers/default-form";

const makeEditor = () =>
  createEditor({
    nodes: formNodes,
    onError: (error) => {
      throw error;
    },
  });

function fixture() {
  const editor = makeEditor();
  let parts!: ReturnType<typeof setup>;

  function setup() {
    const source = $createInputNode();
    const title = $createQuestionNode().append($createTextNode("Assistance details"));
    const hint = $createParagraphNode().append($createTextNode("Tell us what would help."));
    const answer = $createInputNode();
    $getRoot().append(
      $setSettings($createFormTitleNode().append($createTextNode("Apply")), { logicVersion: 2 }),
      $createPageTitleNode().append($createTextNode("Details")),
      $createQuestionNode().append($createTextNode("Assistance needed")),
      source,
      title,
      hint,
      answer,
    );
    $ensureBlockIds($getRoot());
    $ensureQuestionFields($getRoot());
    const target = $questionKey(answer);

    const rule = $createLogic(
      source,
      { id: "show", type: "SHOW_BLOCKS" },
      { id: "when", type: "SINGLE", field: $questionKey(source), comparison: "IS", value: "yes" },
    );

    $setLogicActions(rule, [{ id: "show", type: "SHOW_BLOCKS", showBlocks: [target] }]);

    return { source, title, hint, answer, target, rule };
  }

  editor.update(
    () => {
      parts = setup();
    },
    { discrete: true },
  );

  return { editor, ...parts };
}

test.each(["target", "action", "rule"] as const)(
  "removing the last Show %s exposes recovery without unhiding anything",
  (kind) => {
    const { editor, title, hint, answer, rule, target } = fixture();
    editor.update(
      () => {
        expect(
          $ruleLinkSources().find((source) => source.target === target)?.hidden,
        ).toBeUndefined();

        if (kind === "target")
          $setLogicActions(rule, [{ id: "show", type: "SHOW_BLOCKS", showBlocks: [] }]);
        else if (kind === "action")
          $setLogicActions(rule, [
            { id: "require", type: "REQUIRE_ANSWER", requireAnswer: target },
          ]);
        else rule.remove();
        expect($ruleLinkSources().find((source) => source.target === target)?.hidden).toBe("whole");
        expect([title, hint, answer].every((node) => $settings(node).hidden)).toBe(true);
        $makeVisibleWithoutShow(answer);
        expect([title, hint, answer].some((node) => $settings(node).hidden)).toBe(false);
        expect(
          $ruleLinkSources().find((source) => source.target === target)?.hidden,
        ).toBeUndefined();
      },
      { discrete: true },
    );
  },
);

test("recovery respects remaining whole-question and page-level Show owners", () => {
  const { editor, source, title, answer, target, rule } = fixture();
  editor.update(
    () => {
      const remaining = $createLogic(source, {
        id: "remaining",
        type: "SHOW_BLOCKS",
        showBlocks: [target],
      });

      rule.remove();
      expect($hiddenWithoutShow(answer)).toEqual([]);
      const page = $createWidgetNode("page-break");
      title.insertBefore(page);
      page.insertAfter($createPageTitleNode().append($createTextNode("Assistance")));
      $ensureBlockIds($getRoot());
      $setLogicActions(remaining, [
        { id: "remaining", type: "SHOW_BLOCKS", showBlocks: [$blockId(page)] },
      ]);
      expect($hiddenWithoutShow(answer)).toEqual([]);
      $makeVisibleWithoutShow(answer);
      expect($settings(answer).hidden).toBe(true);
      remaining.remove();
      expect($ruleLinkSources().find((source) => source.target === target)?.hidden).toBe("whole");
    },
    { discrete: true },
  );
});

test("Make visible changes only uncovered hidden parts, preserving other targets and rules", () => {
  const { editor, title, hint, answer, target, rule } = fixture();
  editor.update(
    () => {
      const other = $setSettings($createInputNode(), { hidden: true });
      $getRoot().append($createQuestionNode().append($createTextNode("Keep hidden")), other);
      $ensureBlockIds($getRoot());
      $ensureQuestionFields($getRoot());
      $setLogicActions(rule, [
        { id: "show", type: "SHOW_BLOCKS", showBlocks: [$blockId(title), `${target}:${target}`] },
      ]);
      const ruleBefore = JSON.stringify($settings(rule));
      expect($hiddenWithoutShow(answer).map((node) => node.getKey())).toEqual([hint.getKey()]);
      expect($ruleLinkSources().find((source) => source.target === target)?.hidden).toBe("part");
      $makeVisibleWithoutShow(answer);
      expect($settings(hint).hidden).toBeUndefined();
      expect([title, answer, other].every((node) => $settings(node).hidden)).toBe(true);
      expect(JSON.stringify($settings(rule))).toBe(ruleBefore);
    },
    { discrete: true },
  );
});

test("recovery rechecks coverage if a Show owner is added after the note was displayed", () => {
  const { editor, source, answer, target, rule } = fixture();
  editor.update(
    () => {
      rule.remove();
      expect($hiddenWithoutShow(answer)).toHaveLength(3);
      $createLogic(source, { id: "new", type: "SHOW_BLOCKS", showBlocks: [target] });
      $makeVisibleWithoutShow(answer);
      expect($settings(answer).hidden).toBe(true);
      expect($hiddenWithoutShow(answer)).toEqual([]);
    },
    { discrete: true },
  );
});

test("Make visible is one undoable edit and recovery follows undo and redo", async () => {
  const { editor, title, hint, answer, target, rule } = fixture();
  editor.update(() => rule.remove(), { discrete: true });
  const stop = registerEditorHistory(editor);

  const snapshot = () =>
    editor.getEditorState().read(
      () => ({
        hidden: [title, hint, answer].map((node) => !!$settings(node).hidden),
        recovery: $ruleLinkSources().find((source) => source.target === target)?.hidden,
      }),
      { editor: editor },
    );

  try {
    editor.update(() => $makeVisibleWithoutShow(answer), { discrete: true });
    expect(snapshot()).toEqual({ hidden: [false, false, false], recovery: undefined });
    editor.dispatchCommand(UNDO_COMMAND, undefined);
    await Promise.resolve();
    expect(snapshot()).toEqual({ hidden: [true, true, true], recovery: "whole" });
    editor.dispatchCommand(REDO_COMMAND, undefined);
    await Promise.resolve();
    expect(snapshot()).toEqual({ hidden: [false, false, false], recovery: undefined });
  } finally {
    stop();
  }
});

test("recovery derives from source edits and survives a canonical reload without extra metadata", () => {
  const { editor } = fixture();

  const document = readMarkdown(
    writeMarkdown(fromEditor(editor.getEditorState().toJSON())),
  ).document!;

  document.pages.forEach((page) => {
    page.blocks = page.blocks.filter((block) => block.type !== "content" || block.kind !== "logic");
  });
  const source = writeMarkdown(document);
  const prepared = prepareSource(source);
  const reloaded = makeEditor();
  reloaded.setEditorState(reloaded.parseEditorState(prepared.state));
  reloaded.getEditorState().read(
    () => {
      expect(
        $ruleLinkSources().find((question) => question.fallback === "Assistance details")?.hidden,
      ).toBe("whole");
    },
    { editor: reloaded },
  );
  expect(prepareSource(prepared.source).source).toBe(prepared.source);
  expect(writeMarkdown(fromEditor(reloaded.getEditorState().toJSON()))).toBe(prepared.source);
});

test("untitled inputs and statically hidden questions have one recovery row each", () => {
  const editor = makeEditor();
  editor.update(
    () => {
      const inputs = [
        $createInputNode(),
        $createLongAnswerNode(),
        $createOptionNode("dropdown").append($createTextNode("First")),
        $createWidgetNode("file-upload"),
        $createWidgetNode("checkbox-accordion"),
      ];

      $getRoot().append($createFormTitleNode(), ...inputs);

      for (const input of inputs) $setSettings(input, { hidden: true });
      inputs[2]!.insertAfter(
        $setSettings($createOptionNode("dropdown").append($createTextNode("Second")), {
          hidden: true,
        }),
      );
      $ensureBlockIds($getRoot());
      $ensureQuestionFields($getRoot());
      const sources = $ruleLinkSources();
      expect(sources).toHaveLength(inputs.length);
      expect(sources.map((source) => source.titleKey)).toEqual(inputs.map((node) => node.getKey()));
      expect(sources.every((source) => source.hidden === "whole")).toBe(true);
      $makeVisibleWithoutShow(inputs[2]!);
      expect($hiddenWithoutShow(inputs[2]!)).toEqual([]);
      expect(
        inputs.filter((_, index) => index !== 2).every((input) => $settings(input).hidden),
      ).toBe(true);
    },
    { discrete: true },
  );
});
