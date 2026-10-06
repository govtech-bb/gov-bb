import { jsonSetting } from "../helpers/serialized-test-data";
import { $isOptionNode } from "../../src/forms/editor/answer-nodes";
import { nativeRegistryEditor, nativeRegistryForm } from "../helpers/native-registry-editor";
import { $native } from "../../src/forms/editor/native-state";
import { visitNativeReferences } from "../../src/forms/schema";
import { createEditor } from "../helpers/default-form";
import { expect, test } from "vitest";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  REDO_COMMAND,
  UNDO_COMMAND,
  type LexicalNode,
} from "lexical";
import {
  $createLogic,
  $finishFollowUp,
  $hideShowTargets,
  $logicActions,
  $logicLinks,
  $logicNodes,
  $setLogicActions,
  $showTargetBlocks,
} from "../../src/forms/features/logic/authoring";
import { $blockId, $depth, $setSettings, $settings } from "../../src/editor/core/document-state";
import {
  $createFormTitleNode,
  $createPageTitleNode,
  $createQuestionNode,
  $ensureBlockIds,
  $ensureQuestionFields,
  $formBlocks,
  $questionKey,
} from "../../src/forms/editor/nodes";
import {
  $createInputNode,
  $createOptionNode,
  $createWidgetNode,
  type OptionNode,
} from "../../src/forms/editor/answer-nodes";
import { formNodes } from "../helpers/default-form";
import { $addFollowUp } from "../../src/forms/editor/nesting";
import { $registryBlocks as $govbbField } from "../../src/forms/editor/registry-module";
import { $insertBlocks } from "../../src/forms/editor/insertion";
import { $duplicateQuestion } from "../../src/forms/editor/structure/blocks";
import { registerEditorHistory } from "../../src/editor/core/history";
import { compileForm, type Action } from "../helpers/default-form";
import { $blockTree, $fields } from "../../src/forms/features/logic/queries";

const editorForTest = () =>
  createEditor({
    nodes: formNodes,
    onError: (error) => {
      throw error;
    },
  });

function question(label: string) {
  return [$createQuestionNode().append($createTextNode(label)), $createInputNode()];
}

function setup(kind: "multiple-choice" | "checkboxes" = "multiple-choice") {
  const title = $createQuestionNode().append($createTextNode("Close a road?"));
  const yes = $createOptionNode(kind).append($createTextNode("Yes"));
  const no = $createOptionNode(kind).append($createTextNode("No"));
  $getRoot().append($createFormTitleNode(), title, yes, no);
  $ensureBlockIds($getRoot());
  $ensureQuestionFields($getRoot());

  return { title, yes, no };
}

function followUp(option: OptionNode, nodes: LexicalNode[]) {
  $insertBlocks(nodes, $addFollowUp(option));

  return $finishFollowUp(option, nodes);
}

function optionNode(key: string): OptionNode {
  const node = $getRoot()
    .getChildren()
    .find((node) => node.getKey() === key);

  if (!$isOptionNode(node)) throw Error("Expected an option node");

  return node;
}

test("selecting a Show target hides its whole question and immediately projects native visibility", () => {
  const editor = editorForTest();
  let target = "";
  editor.update(
    () => {
      const { title, yes, no } = setup();
      const detailTitle = $createQuestionNode().append($createTextNode("Which road?"));
      const hint = $createParagraphNode().append($createTextNode("Use the full name."));
      const answer = $createInputNode();
      $getRoot().append(detailTitle, hint, answer);
      $ensureBlockIds($getRoot());
      $ensureQuestionFields($getRoot());
      target = $questionKey(answer);

      const rule = $createLogic(
        yes,
        { id: "show", type: "SHOW_BLOCKS" },
        {
          id: "yes",
          type: "SINGLE",
          field: $questionKey(yes),
          comparison: "IS",
          value: $blockId(yes),
        },
      );

      $setLogicActions(rule, [{ id: "show", type: "SHOW_BLOCKS", showBlocks: [target] }]);
      expect([detailTitle, hint, answer].map((node) => $settings(node).hidden)).toEqual([
        true,
        true,
        true,
      ]);
      expect([title, yes, no].some((node) => $settings(node).hidden)).toBe(false);
    },
    { discrete: true },
  );

  const field = compileForm(editor.getEditorState()).pages[0]!.blocks.find(
    (block) => block.id === target,
  );

  expect(field?.shownWhen).toMatchObject([{ operator: "equal", value: "yes" }]);
});

test("Show edits preserve existing visibility and other rules; removing a target never unhides it", () => {
  const editor = editorForTest();
  editor.update(
    () => {
      const { yes } = setup();

      const existing = question("Existing"),
        added = question("New");

      $getRoot().append(...existing, ...added);
      $ensureBlockIds($getRoot());
      $ensureQuestionFields($getRoot());

      const existingId = $questionKey(existing[1]!),
        addedId = $questionKey(added[1]!);

      const other = $createLogic(yes, { id: "hide", type: "HIDE_BLOCKS", hideBlocks: [addedId] });
      const otherBefore = JSON.stringify($settings(other));
      const rule = $createLogic(yes, { id: "show", type: "SHOW_BLOCKS", showBlocks: [existingId] });
      $setLogicActions(rule, [
        ...$logicActions(rule),
        {
          id: "wording",
          type: "CHANGE_LABEL",
          changeLabel: { target: existingId, text: "Renamed" },
        },
      ]);
      expect(existing.some((node) => $settings(node).hidden)).toBe(false);
      $setLogicActions(rule, [
        { id: "show", type: "SHOW_BLOCKS", showBlocks: [existingId, addedId] },
      ]);
      expect(existing.some((node) => $settings(node).hidden)).toBe(false);
      expect(added.every((node) => $settings(node).hidden)).toBe(true);
      $setLogicActions(rule, [{ id: "show", type: "SHOW_BLOCKS", showBlocks: [existingId] }]);
      expect(added.every((node) => $settings(node).hidden)).toBe(true);
      expect(JSON.stringify($settings(other))).toBe(otherBefore);
      $hideShowTargets(rule);
      expect(existing.every((node) => $settings(node).hidden)).toBe(true);
    },
    { discrete: true },
  );
});

test("Show target coverage follows individual blocks, compacted questions and page bodies", () => {
  const editor = editorForTest();
  editor.update(
    () => {
      const { yes, title, no } = setup();
      const rule = $createLogic(yes, { id: "show", type: "SHOW_BLOCKS" });
      const target = $questionKey(yes);
      $setLogicActions(rule, [
        { id: "show", type: "SHOW_BLOCKS", showBlocks: [`${target}:${target}`] },
      ]);
      expect($settings(yes).hidden).toBe(true);
      expect($settings(title).hidden).toBeUndefined();
      expect($settings(no).hidden).toBeUndefined();
      $setSettings(yes, { hidden: false });
      $setLogicActions(rule, [{ id: "show", type: "SHOW_BLOCKS", showBlocks: [target] }]);
      expect($settings(yes).hidden).toBeUndefined(); // A compacted ID still covers the same existing answer block.
      expect($settings(title).hidden).toBe(true);
      expect($settings(no).hidden).toBe(true);

      const page = $createWidgetNode("page-break"),
        head = $createPageTitleNode().append($createTextNode("More")),
        body = $createParagraphNode().append($createTextNode("Read this"));

      $getRoot().append(page, head, body);
      $ensureBlockIds($getRoot());
      $setLogicActions(rule, [{ id: "show", type: "SHOW_BLOCKS", showBlocks: [$blockId(page)] }]);
      expect($showTargetBlocks($logicActions(rule)).map((node) => node.getKey())).toEqual([
        body.getKey(),
      ]);
      expect($settings(body).hidden).toBe(true);
      expect($settings(head).hidden).toBeUndefined();
      expect($settings(page).hidden).toBeUndefined();
    },
    { discrete: true },
  );
});

test("one undo restores both the Show selection and every target's original visibility", async () => {
  const editor = editorForTest();
  let rule: LexicalNode, nodes: LexicalNode[], next: Action[];
  editor.update(
    () => {
      const { yes } = setup();
      nodes = question("Details");
      $getRoot().append(...nodes);
      $ensureBlockIds($getRoot());
      $ensureQuestionFields($getRoot());
      $setSettings(nodes[0]!, { hidden: true });
      rule = $createLogic(yes, { id: "show", type: "SHOW_BLOCKS" });
      next = [{ id: "show", type: "SHOW_BLOCKS", showBlocks: [$questionKey(nodes[1]!)] }];
    },
    { discrete: true },
  );
  const stop = registerEditorHistory(editor);

  const state = () =>
    editor.getEditorState().read(
      () => ({
        actions: $logicActions(rule),
        hidden: nodes.map((node) => $settings(node).hidden),
      }),
      { editor: editor },
    );

  try {
    editor.update(() => $setLogicActions(rule, next), { discrete: true });
    expect(state().hidden).toEqual([true, true]);
    editor.dispatchCommand(UNDO_COMMAND, undefined);
    await Promise.resolve();
    expect(state()).toEqual({
      actions: [{ id: "show", type: "SHOW_BLOCKS" }],
      hidden: [true, undefined],
    });
    editor.dispatchCommand(REDO_COMMAND, undefined);
    await Promise.resolve();
    expect(state()).toEqual({ actions: next!, hidden: [true, true] });
  } finally {
    stop();
  }
});

test("logic selectors prefer visible question titles and retain aliases for untitled questions", () => {
  const editor = editorForTest();
  editor.update(
    () => {
      const { title, yes } = setup();
      $setSettings(yes, { name: "roadClosure" });
      const untitled = $setSettings($createInputNode(), { name: "Internal fallback" });
      $getRoot().append($createQuestionNode(), untitled);
      $ensureBlockIds($getRoot());
      $ensureQuestionFields($getRoot());
      expect($fields().find((field) => field.key === $questionKey(yes))?.title).toBe(
        title.getTextContent(),
      );
      expect(
        $blockTree().find((row) => row.kind === "question" && row.id === $questionKey(yes))?.label,
      ).toBe(title.getTextContent());
      expect($fields().find((field) => field.key === $questionKey(untitled))?.title).toBe(
        "Internal fallback",
      );
      expect(
        $blockTree().find((row) => row.kind === "question" && row.id === $questionKey(untitled))
          ?.label,
      ).toBe("Internal fallback");
      expect($settings(yes).name).toBe("roadClosure");
    },
    { discrete: true },
  );
});

test("follow-up insertion owns one visible Show rule and hides only its new question", () => {
  const editor = editorForTest();
  editor.update(
    () => {
      const { yes, no, title } = setup();
      const nodes = question("Which road?");
      const key = followUp(yes, nodes);
      const [rule] = $logicNodes();
      expect(rule?.getKey()).toBe(key);
      expect($settings(rule!).conditionals).toMatchObject([
        { field: $questionKey(yes), comparison: "IS", value: $blockId(yes) },
      ]);
      expect($logicActions(rule!)[0]?.showBlocks).toEqual([$questionKey(nodes[1]!)]);
      expect(nodes.map((node) => $settings(node).hidden)).toEqual([true, true]);
      expect([title, yes, no].every((node) => !$settings(node).hidden)).toBe(true);
      expect($depth(rule!)).toBe(0);
      expect(no.isBefore(rule!)).toBe(true);
      expect($questionKey(yes)).toBe($questionKey(no));
    },
    { discrete: true },
  );
});

test("adding another follow-up to one answer consolidates targets, while another answer gets its own rule", () => {
  const editor = editorForTest();
  editor.update(
    () => {
      const { yes, no } = setup("checkboxes");

      const first = question("First"),
        second = question("Second"),
        other = question("Other");

      const firstRule = followUp(yes, first);
      expect(followUp(yes, second)).toBe(firstRule);
      expect(followUp(no, other)).not.toBe(firstRule);
      const rule = $logicNodes().find((node) => node.getKey() === firstRule)!;
      expect($settings(rule).conditionals).toMatchObject([
        { comparison: "CONTAINS", value: $blockId(yes) },
      ]);
      expect($logicActions(rule)[0]?.showBlocks).toEqual([
        $questionKey(first[1]!),
        $questionKey(second[1]!),
      ]);
    },
    { discrete: true },
  );
});

test("wording rules for nested targets stay outside the source option group and link to the target", () => {
  const editor = editorForTest();
  editor.update(
    () => {
      const { yes, no } = setup();
      const nodes = question("Road name");
      followUp(yes, nodes);
      const target = $questionKey(nodes[1]!);

      const rule = $createLogic(nodes[0]!, {
        id: "label",
        type: "CHANGE_LABEL",
        changeLabel: { target, text: "Main road name" },
      });

      expect(no.isBefore(rule)).toBe(true);
      expect($depth(rule)).toBe(0);
      expect($logicLinks([target]).map((link) => link.effects)).toEqual([["Wording"], ["Shown"]]);
      $setSettings(rule, {
        actions: [
          { id: "label", type: "REQUIRE_ANSWER", changeLabel: { target, text: "stale payload" } },
        ],
      });
      expect($logicLinks([target])).toHaveLength(1);
      expect($formBlocks().filter((node) => node.getTextContent() === "Road name")).toHaveLength(1);
    },
    { discrete: true },
  );
});

test("a native composite follow-up keeps one owner per inner target and includes the outer answer", () => {
  const editor = nativeRegistryEditor();

  let yesKey = "",
    outerId = "",
    yesId = "";

  try {
    editor.update(
      () => {
        const yes = $createOptionNode("multiple-choice").append($createTextNode("Yes"));
        yesKey = yes.getKey();
        $getRoot().append(
          $createQuestionNode().append($createTextNode("Close a road?")),
          yes,
          $createOptionNode("multiple-choice").append($createTextNode("No")),
        );
      },
      { discrete: true },
    );
    editor.update(
      () => {
        const yes = optionNode(yesKey);

        outerId = $native(yes).owner!;
        yesId = $native(yes).option!.id;
        followUp(yes, $govbbField("GOVBB_ADDRESS_COUNTRY"));
      },
      { discrete: true },
    );

    const form = nativeRegistryForm(editor),
      logic = form.blocks.filter((block) => block.type === "logic");

    expect(logic).toHaveLength(2);
    const owners = new Map<string, number>();

    for (const block of logic) {
      const refs: { kind: string; id: string; ownerId?: string }[] = [];
      visitNativeReferences({ ...form, blocks: [block] }, (reference) => refs.push(reference));
      expect(refs).toContainEqual(
        expect.objectContaining({ kind: "option", id: yesId, ownerId: outerId }),
      );

      for (const rule of block.rules)
        for (const action of rule.actions)
          if (action.type === "setVisible")
            for (const target of action.targets) {
              const key = JSON.stringify(target);
              owners.set(key, (owners.get(key) ?? 0) + 1);
            }
    }

    expect([...owners.values()].every((count) => count === 1)).toBe(true);
    expect(owners.size).toBe(5);
  } finally {
    editor.dispose();
  }
});

test("duplicating a question copies its self-contained Show rule without unrelated actions and preserves team field metadata", () => {
  const editor = editorForTest();
  editor.update(
    () => {
      const { title, yes } = setup();
      const created = $govbbField("GOVBB_POSTCODE");
      followUp(yes, created);
      const original = $logicNodes()[0]!;
      $setSettings(original, {
        actions: jsonSetting([
          ...$logicActions(original),
          { id: "unrelated", type: "REQUIRE_ANSWER", requireAnswer: $questionKey(yes) },
        ]),
      });
      const originalSettings = JSON.stringify($settings(original));
      const before = new Set($formBlocks().map((node) => node.getKey()));
      $duplicateQuestion(title);
      const copies = $formBlocks().filter((node) => !before.has(node.getKey()));
      const copiedYes = copies.find((node) => node.getTextContent() === "Yes")!;
      const copiedInput = copies.find((node) => node.getType() === "input")!;
      const copiedRule = copies.find((node) => node.getType() === "widget")!;
      expect($logicActions(copiedRule)).toHaveLength(1);
      expect($logicActions(copiedRule)[0]?.showBlocks).toEqual([$questionKey(copiedInput)]);
      expect($settings(copiedRule).conditionals).toMatchObject([
        { field: $questionKey(copiedYes), value: $blockId(copiedYes) },
      ]);
      expect($questionKey(copiedYes)).not.toBe($questionKey(yes));
      expect($native(copiedInput).question?.kind).toBe("text");
      expect($native(copiedInput).question?.id).not.toBe($native(created.at(-1)!).question?.id);
      expect($native(copiedInput).question?.config).toEqual(
        $native(created.at(-1)!).question?.config,
      );
      expect($native(copiedInput).question?.validation).toEqual(
        $native(created.at(-1)!).question?.validation,
      );
      expect($settings(copiedInput).errors).toEqual($settings(created.at(-1)!).errors);
      expect(JSON.stringify($settings(original))).toBe(originalSettings);
    },
    { discrete: true },
  );
});

test("duplicating a question does not copy Show rules with dependencies or targets outside the copied question", () => {
  const editor = editorForTest();
  editor.update(
    () => {
      const { title, yes } = setup();
      const inside = question("Inside");
      followUp(yes, inside);
      const outside = question("Outside");
      $getRoot().append(...outside);
      $ensureBlockIds($getRoot());
      $ensureQuestionFields($getRoot());
      $createLogic(
        yes,
        { id: "outside-target", type: "SHOW_BLOCKS", showBlocks: [$questionKey(outside[1]!)] },
        {
          id: "condition",
          type: "SINGLE",
          field: $questionKey(yes),
          comparison: "IS",
          value: $blockId(yes),
        },
      );
      $createLogic(
        yes,
        { id: "outside-source", type: "SHOW_BLOCKS", showBlocks: [$questionKey(inside[1]!)] },
        {
          id: "condition",
          type: "SINGLE",
          field: $questionKey(outside[1]!),
          comparison: "IS_NOT_EMPTY",
        },
      );
      const originalRules = $logicNodes().map((node) => node.getKey());
      $duplicateQuestion(title);
      const copies = $logicNodes().filter((node) => !originalRules.includes(node.getKey()));
      expect(copies).toHaveLength(1);
      expect($logicActions(copies[0]!)).toHaveLength(1);
      expect($logicActions(copies[0]!)[0]?.id).not.toBe("outside-target");
      expect($logicActions(copies[0]!)[0]?.id).not.toBe("outside-source");
    },
    { discrete: true },
  );
});

test("native follow-ups consolidate each answer's targets and undo the insertion with its rule", async () => {
  const editor = nativeRegistryEditor();

  let yesKey = "",
    noKey = "";

  editor.update(
    () => {
      const yes = $createOptionNode("multiple-choice").append($createTextNode("Yes")),
        no = $createOptionNode("multiple-choice").append($createTextNode("No"));

      yesKey = yes.getKey();
      noKey = no.getKey();
      $getRoot().append($createQuestionNode().append($createTextNode("More details?")), yes, no);
    },
    { discrete: true },
  );
  const stop = registerEditorHistory(editor);

  const add = (key: string, label: string) =>
    editor.update(() => followUp(optionNode(key), question(label)), { discrete: true });

  try {
    add(yesKey, "First detail");
    add(yesKey, "Second detail");

    const before = nativeRegistryForm(editor),
      rule = before.blocks.find((block) => block.type === "logic")!;

    expect(before.blocks.filter((block) => block.type === "logic")).toHaveLength(1);
    expect(rule.type === "logic" && rule.rules[0]!.actions[0]).toMatchObject({
      type: "setVisible",
      targets: expect.arrayContaining(
        before.blocks
          .filter((block) => block.type === "question" && block.visible === false)
          .map((block) => block.id),
      ),
    });
    add(noKey, "Alternative detail");
    const after = nativeRegistryForm(editor);
    expect(after.blocks.filter((block) => block.type === "logic")).toHaveLength(2);
    editor.dispatchCommand(UNDO_COMMAND, undefined);
    await Promise.resolve();
    expect(nativeRegistryForm(editor)).toEqual(before);
    editor.dispatchCommand(REDO_COMMAND, undefined);
    await Promise.resolve();
    expect(nativeRegistryForm(editor)).toEqual(after);
  } finally {
    stop();
    editor.dispose();
  }
});

test("nested native follow-ups include every ancestor option", () => {
  const editor = nativeRegistryEditor();

  let outer = "",
    inner = "";

  try {
    editor.update(
      () => {
        const yes = $createOptionNode("multiple-choice").append($createTextNode("Yes"));
        outer = yes.getKey();
        $getRoot().append(
          $createQuestionNode().append($createTextNode("First question")),
          yes,
          $createOptionNode("multiple-choice").append($createTextNode("No")),
        );
      },
      { discrete: true },
    );
    editor.update(
      () => {
        const yes = $createOptionNode("checkboxes").append($createTextNode("Chosen"));
        inner = yes.getKey();
        followUp(optionNode(outer), [
          $createQuestionNode().append($createTextNode("Second question")),
          yes,
        ]);
      },
      { discrete: true },
    );
    editor.update(() => followUp(optionNode(inner), question("Nested detail")), { discrete: true });

    const form = nativeRegistryForm(editor),
      detail = form.blocks.find(
        (block) => block.type === "question" && block.label === "Nested detail",
      )!;

    const logic = form.blocks.find(
      (block) =>
        block.type === "logic" &&
        block.rules.some((rule) =>
          rule.actions.some(
            (action) => action.type === "setVisible" && action.targets.includes(detail.id),
          ),
        ),
    );

    expect(logic?.type === "logic" && logic.rules[0]!.when).toMatchObject({
      op: "all",
      conditions: [
        expect.objectContaining({ op: "selected" }),
        expect.objectContaining({ op: "selected" }),
      ],
    });
  } finally {
    editor.dispose();
  }
});
