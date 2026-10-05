import { createEditor } from "../helpers/default-form";
import { LinkNode } from "@lexical/link";
import { HeadingNode } from "@lexical/rich-text";
import { expect, test } from "vitest";
import { $createTextNode, $getRoot } from "lexical";
import { capabilityWarnings, logicIssues } from "../../src/forms/editor/capabilities";
import { compileForm, type FormLogic, type FormBlock } from "../helpers/default-form";
import { $migrateLegacyConditions } from "../../src/forms/features/logic/migration";
import { logicActionKey, projectLogicRules } from "../../src/forms/adapters/ssb/logic-rules";
import { MentionNode } from "../../src/forms/features/mentions/node";
import { $blockId, $setDepth, $setSettings, $settings } from "../../src/editor/core/document-state";
import {
  $blockKind,
  $createFormTitleNode,
  $createPageTitleNode,
  $createQuestionNode,
  $ensureBlockIds,
  $ensureQuestionFields,
  $formBlocks,
  $isInput,
  $questionKey,
  $shareQuestionSettings,
} from "../../src/forms/editor/nodes";
import { $createBulletNode } from "../../src/editor/modules/lists/nodes";
import {
  $createInputNode,
  $createOptionNode,
  $createWidgetNode,
  $isWidgetNode,
} from "../../src/forms/editor/answer-nodes";
import { $createShowHideNode } from "../../src/editor/modules/disclosure/nodes";
import { formNodes } from "../helpers/default-form";

function question(blocks: FormBlock[], id: string): Extract<FormBlock, { type: "question" }> {
  const block = blocks.find((block) => block.id === id);

  if (block?.type !== "question") throw Error(`Missing question ${id}`);

  return block;
}

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

function legacy() {
  const editor = makeEditor();

  let source = "",
    yesId = "",
    noId = "",
    target = "";

  editor.update(
    () => {
      const yes = $createOptionNode("multiple-choice").append($createTextNode("Yes"));
      const no = $createOptionNode("multiple-choice").append($createTextNode("No"));
      const input = $setDepth($createInputNode(), 1);
      $getRoot().append(
        $createFormTitleNode().append($createTextNode("Application")),
        $createPageTitleNode().append($createTextNode("About you")),
        $createQuestionNode().append($createTextNode("Need help?")),
        yes,
        $setDepth($createQuestionNode().append($createTextNode("Details")), 1),
        input,
        no,
      );
      settle();
      source = $questionKey(yes);
      yesId = $blockId(yes);
      noId = $blockId(no);
      target = $questionKey(input);
    },
    { discrete: true },
  );

  return { editor, source, yesId, noId, target };
}

const questions = (editor: ReturnType<typeof makeEditor>) =>
  compileForm(editor.getEditorState()).pages[0]!.blocks.filter(
    (block): block is Extract<FormBlock, { type: "question" }> => block.type === "question",
  );

test("legacy follow-ups and ordered wording become visible rules with a Hidden baseline", () => {
  const { editor, source, yesId, noId, target } = legacy();
  editor.update(
    () => {
      const input = $formBlocks().find((node) => $isInput(node) && $questionKey(node) === target)!;
      $setSettings(input, {
        conditionalLabel: [
          {
            id: "one",
            field: source,
            operator: "equal",
            value: { option: yesId },
            text: "Tell us what help you need",
          },
          {
            id: "two",
            field: source,
            operator: "equal",
            value: { option: noId },
            text: "Anything else?",
          },
        ],
      });
      $migrateLegacyConditions();
      expect($settings($getRoot().getFirstChild()!).logicVersion).toBe(2);
      expect($settings(input).conditionalLabel).toBeUndefined();
      expect($settings(input).hidden).toBe(true);
      expect(
        $formBlocks().filter(
          (node) => $isWidgetNode(node) && $blockKind(node) === "conditional-logic",
        ),
      ).toHaveLength(3);
    },
    { discrete: true },
  );
  const schema = compileForm(editor.getEditorState());
  const field = questions(editor).find((question) => question.id === target)!;
  expect(field.conditionalLabel?.map((row) => [row.value, row.label])).toEqual([
    ["yes", "Tell us what help you need"],
    ["no", "Anything else?"],
  ]);
  expect(field.shownWhen).toEqual([
    {
      type: "fieldConditionalOn",
      targetFieldId: questions(editor)[0]!.fieldId,
      operator: "equal",
      value: "yes",
    },
  ]);
  expect(field.hidden).toBeUndefined();
  expect(logicIssues(schema)).toEqual([]);
  expect(capabilityWarnings(schema)).toEqual([]);
});

test("version 2 indentation never invents conditions; deleting migrated logic survives another migration call", () => {
  const { editor, target } = legacy();
  expect(questions(editor).find((q) => q.id === target)!.shownWhen).toBeUndefined();
  editor.update(
    () => {
      $migrateLegacyConditions();
      $formBlocks()
        .filter((node) => $isWidgetNode(node) && $blockKind(node) === "conditional-logic")
        .forEach((node) => node.remove());
      $migrateLegacyConditions();
    },
    { discrete: true },
  );
  const field = questions(editor).find((q) => q.id === target)!;
  expect(field.shownWhen).toBeUndefined();
  expect(field.hidden).toBe(true);
});

test("a reader-operated disclosure retains native plumbing without an answer rule", () => {
  const editor = makeEditor();
  editor.update(
    () => {
      $getRoot().append(
        $createFormTitleNode(),
        $createPageTitleNode(),
        $createShowHideNode().append($createTextNode("Use another address")),
        $setDepth($createQuestionNode().append($createTextNode("Address")), 1),
        $setDepth($createInputNode(), 1),
      );
      settle();
      $migrateLegacyConditions();
    },
    { discrete: true },
  );
  const schema = compileForm(editor.getEditorState());
  expect(schema.pages[0]!.blocks.filter((block) => block.type === "logic")).toHaveLength(0);
  expect(questions(editor)[0]!.shownWhen?.[0]).toMatchObject({ operator: "equal", value: true });
});

test("one condition can change a question label and page title with ordered fallback behavior", () => {
  const { editor, source, yesId, target } = legacy();
  editor.update(
    () => {
      $setSettings($getRoot().getFirstChild()!, { logicVersion: 2 });

      for (const text of ["First match", "Later match"])
        $getRoot().append(
          $setSettings($createWidgetNode("conditional-logic"), {
            logicalOperator: "AND",
            conditionals: [
              { id: "c", type: "SINGLE", field: source, comparison: "IS", value: yesId },
            ],
            actions: [
              { id: "label", type: "CHANGE_LABEL", changeLabel: { target, text } },
              {
                id: "title",
                type: "CHANGE_PAGE_TITLE",
                changePageTitle: { target: "start", text },
              },
            ],
          }),
        );
      settle();
    },
    { discrete: true },
  );
  const schema = compileForm(editor.getEditorState());
  expect(schema.pages[0]!.title).toBe("About you");
  expect(schema.pages[0]!.conditionalTitle?.map((row) => row.title)).toEqual([
    "First match",
    "Later match",
  ]);
  expect(questions(editor).find((q) => q.id === target)!.title).toBe("Details");
  expect(
    questions(editor)
      .find((q) => q.id === target)!
      .conditionalLabel?.map((row) => row.label),
  ).toEqual(["First match", "Later match"]);
  expect(capabilityWarnings(schema)).toEqual([]);
});

test("native literal choice values survive migration without being mistaken for option references", () => {
  const { editor, source, target } = legacy();
  editor.update(
    () => {
      const input = $formBlocks().find((node) => $isInput(node) && $questionKey(node) === target)!;
      $setSettings(input, {
        conditionalLabel: [
          {
            id: "literal",
            field: source,
            operator: "equal",
            value: "imported-value",
            text: "Imported replacement",
          },
        ],
      });
      $migrateLegacyConditions();
    },
    { discrete: true },
  );
  const schema = compileForm(editor.getEditorState());
  expect(questions(editor).find((q) => q.id === target)!.conditionalLabel?.[0]?.value).toBe(
    "imported-value",
  );
  expect(logicIssues(schema)).toEqual([]);
});

test("Show maps only hidden same-page targets and never approximates OR or conflicting visibility rules", () => {
  const { editor, source, yesId, target } = legacy();
  const schema = compileForm(editor.getEditorState());
  const field = question(schema.pages[0]!.blocks, target);

  const rule: FormLogic = {
    type: "logic",
    id: "rule",
    logicalOperator: "AND",
    conditionals: [{ id: "c", type: "SINGLE", field: source, comparison: "IS", value: yesId }],
    actions: [{ id: "a", type: "SHOW_BLOCKS", showBlocks: [target] }],
  };

  schema.pages[0]!.blocks.push(rule);
  expect(projectLogicRules(schema, false).warnings[0]?.message).toContain("Hide targets initially");
  field.hidden = true;
  field.titleHidden = true;
  expect(projectLogicRules(schema, false).supportedActions.has(logicActionKey("rule", "a"))).toBe(
    true,
  );
  rule.logicalOperator = "OR";
  rule.conditionals.push({ ...rule.conditionals[0]!, id: "second" });
  expect(projectLogicRules(schema, false).supportedActions.size).toBe(0);
  rule.logicalOperator = "AND";
  rule.actions.push({ id: "hide", type: "HIDE_BLOCKS", hideBlocks: [target] });
  expect(
    projectLogicRules(schema, false).warnings.some((issue) =>
      issue.message.includes("Several visibility rules"),
    ),
  ).toBe(true);
});

test("removed scalar and array option references are errors rather than empty-looking valid conditions", () => {
  const { editor, source } = legacy();
  const schema = compileForm(editor.getEditorState());

  const rule: FormLogic = {
    type: "logic",
    id: "rule",
    logicalOperator: "AND",
    conditionals: [{ id: "c", type: "SINGLE", field: source, comparison: "IS", value: "removed" }],
    actions: [{ id: "a", type: "JUMP_TO_PAGE", jumpToPage: "start" }],
  };

  schema.pages[0]!.blocks.push(rule);
  expect(logicIssues(schema).map((issue) => issue.code)).toEqual(["missing-option"]);
  rule.conditionals = [
    { id: "c", type: "SINGLE", field: source, comparison: "IS_ANY_OF", value: ["removed"] },
  ];
  expect(logicIssues(schema).map((issue) => issue.code)).toEqual(["missing-option"]);
  rule.conditionals = [
    { id: "c", type: "SINGLE", field: source, comparison: "IS_ANY_OF", value: [] },
  ];
  expect(logicIssues(schema).map((issue) => issue.code)).toEqual(["incomplete-condition"]);
});

test("malformed legacy wording fails before consuming settings or creating partial rules", () => {
  const { editor, source, target } = legacy();
  editor.update(
    () => {
      const input = $formBlocks().find((node) => $isInput(node) && $questionKey(node) === target)!;

      const raw = [
        { id: "unknown", field: source, operator: "unrecognized", value: "yes", text: "Keep me" },
      ];

      $setSettings(input, { conditionalLabel: raw });
      expect(() => $migrateLegacyConditions()).toThrow("unsupported operator");
      expect($settings(input).conditionalLabel).toEqual(raw);
      expect($settings(input).hidden).toBeUndefined();
      expect($settings($getRoot().getFirstChild()!).logicVersion).toBeUndefined();
    },
    { discrete: true },
  );
});

test("a migrated list follow-up targets the compiled list once and preserves every item", () => {
  const editor = makeEditor();
  editor.update(
    () => {
      $getRoot().append(
        $createFormTitleNode(),
        $createPageTitleNode(),
        $createQuestionNode().append($createTextNode("Documents needed?")),
        $createOptionNode("multiple-choice").append($createTextNode("Yes")),
        $setDepth($createBulletNode().append($createTextNode("Passport")), 1),
        $setDepth($createBulletNode().append($createTextNode("Proof of address")), 1),
        $createOptionNode("multiple-choice").append($createTextNode("No")),
      );
      settle();
      $migrateLegacyConditions();
    },
    { discrete: true },
  );
  const schema = compileForm(editor.getEditorState());
  const list = schema.pages[0]!.blocks.find((block) => block.type === "list")!;
  expect(list.shownWhen?.[0]).toMatchObject({ value: "yes" });
  expect(list.items.map((item) => [item.markdown, item.hidden])).toEqual([
    ["Passport", undefined],
    ["Proof of address", undefined],
  ]);
  expect(capabilityWarnings(schema)).toEqual([]);
});

test("native Show projection never drops a date transform", () => {
  const { editor, target } = legacy();
  let dateField = "";
  editor.update(
    () => {
      const date = $createInputNode("date");
      $getRoot().append($createQuestionNode().append($createTextNode("Date of birth")), date);
      settle();
      dateField = $questionKey(date);
    },
    { discrete: true },
  );
  const schema = compileForm(editor.getEditorState());
  const field = question(schema.pages[0]!.blocks, target);
  field.hidden = true;
  field.titleHidden = true;
  schema.pages[0]!.blocks.push({
    type: "logic",
    id: "date-rule",
    logicalOperator: "AND",
    conditionals: [
      {
        id: "age",
        type: "SINGLE",
        field: dateField,
        comparison: "EQUAL",
        transform: "yearsSince",
        value: 18,
      },
    ],
    actions: [{ id: "show", type: "SHOW_BLOCKS", showBlocks: [target] }],
  });
  const projection = projectLogicRules(schema);
  expect(projection.supportedActions.size).toBe(0);
  expect(field.hidden).toBe(true);
  expect(projection.warnings[0]?.message).toContain("same-page answer equality");
});

test("unknown option-wrapper data is preserved by refusing lossy migration", () => {
  const { editor, source, yesId, target } = legacy();
  editor.update(
    () => {
      const input = $formBlocks().find((node) => $isInput(node) && $questionKey(node) === target)!;

      const raw = [
        {
          id: "row",
          field: source,
          operator: "equal",
          value: { option: yesId, future: "keep" },
          text: "Replacement",
        },
      ];

      $setSettings(input, { conditionalLabel: raw });
      expect(() => $migrateLegacyConditions()).toThrow("unsupported comparison value");
      expect($settings(input).conditionalLabel).toEqual(raw);
    },
    { discrete: true },
  );
});

test("migration preserves first-match order even when variants reference answers in reverse document order", () => {
  const { editor, source, yesId, target } = legacy();
  editor.update(
    () => {
      const later = $createInputNode();
      $getRoot().append($createQuestionNode().append($createTextNode("Later answer")), later);
      settle();
      const input = $formBlocks().find((node) => $isInput(node) && $questionKey(node) === target)!;
      $setSettings(input, {
        conditionalLabel: [
          {
            id: "first",
            field: $questionKey(later),
            operator: "equal",
            value: "yes",
            text: "Highest priority",
          },
          {
            id: "second",
            field: source,
            operator: "equal",
            value: { option: yesId },
            text: "Lower priority",
          },
        ],
      });
      $migrateLegacyConditions();
    },
    { discrete: true },
  );
  expect(
    questions(editor)
      .find((question) => question.id === target)!
      .conditionalLabel?.map((row) => row.label),
  ).toEqual(["Highest priority", "Lower priority"]);
});

test("duplicate imported action IDs cannot hide warnings for an unmapped action", () => {
  const { editor, source, yesId, target } = legacy();
  const schema = compileForm(editor.getEditorState());
  schema.pages[0]!.blocks.push({
    type: "logic",
    id: "rule",
    logicalOperator: "AND",
    conditionals: [
      { id: "condition", type: "SINGLE", field: source, comparison: "IS", value: yesId },
    ],
    actions: [
      { id: "duplicate", type: "CHANGE_LABEL", changeLabel: { target, text: "New label" } },
      { id: "duplicate", type: "JUMP_TO_PAGE", jumpToPage: "start" },
    ],
  });
  projectLogicRules(schema);
  expect(capabilityWarnings(schema).map((issue) => issue.code)).toEqual([
    "ssb-action-jump_to_page",
  ]);
});

test("repeated Show actions share their target's consumed Hidden baseline without lending it to other targets", () => {
  const { editor, source, yesId, target } = legacy();
  const schema = compileForm(editor.getEditorState());
  const field = question(schema.pages[0]!.blocks, target);
  field.hidden = true;
  field.titleHidden = true;

  const rule: FormLogic = {
    type: "logic",
    id: "rule",
    logicalOperator: "AND",
    conditionals: [
      { id: "condition", type: "SINGLE", field: source, comparison: "IS", value: yesId },
    ],
    actions: [
      { id: "duplicate", type: "SHOW_BLOCKS", showBlocks: [target] },
      { id: "duplicate", type: "SHOW_BLOCKS", showBlocks: [target] },
    ],
  };

  schema.pages[0]!.blocks.push(rule);
  expect(projectLogicRules(schema).supportedActions.size).toBe(2);
  expect(capabilityWarnings(schema)).toEqual([]);
  rule.actions[1] = { id: "duplicate", type: "SHOW_BLOCKS", showBlocks: [source] };
  expect(projectLogicRules(schema, false).supportedActions.size).toBe(1);
  expect(capabilityWarnings(schema)[0]?.message).toContain("Hide targets initially");
});

test("unmapped wording prevents a partial projection from changing first-match semantics", () => {
  const { editor, source, yesId, target } = legacy();
  const schema = compileForm(editor.getEditorState());

  const condition = {
    id: "c",
    type: "SINGLE",
    field: source,
    comparison: "IS",
    value: yesId,
  } as const;

  schema.pages[0]!.blocks.push(
    {
      type: "logic",
      id: "complex",
      logicalOperator: "AND",
      conditionals: [condition, { ...condition, id: "second" }],
      actions: [
        { id: "a", type: "CHANGE_LABEL", changeLabel: { target, text: "Complex first choice" } },
      ],
    },
    {
      type: "logic",
      id: "simple",
      logicalOperator: "AND",
      conditionals: [condition],
      actions: [
        { id: "a", type: "CHANGE_LABEL", changeLabel: { target, text: "Later simple choice" } },
      ],
    },
  );
  expect(projectLogicRules(schema).supportedActions.size).toBe(0);
  expect(question(schema.pages[0]!.blocks, target).conditionalLabel).toBeUndefined();
  expect(capabilityWarnings(schema).map((issue) => issue.where)).toEqual(["complex", "simple"]);
});

test("empty groups are not dropped and an invalid multi-target Show never partially unhides content", () => {
  const { editor, source, yesId, target } = legacy();
  const schema = compileForm(editor.getEditorState());

  const field = question(schema.pages[0]!.blocks, target);

  field.hidden = true;
  field.titleHidden = true;

  const rule: FormLogic = {
    type: "logic",
    id: "rule",
    logicalOperator: "AND",
    conditionals: [
      { id: "c", type: "SINGLE", field: source, comparison: "IS", value: yesId },
      { id: "empty", type: "GROUP", logicalOperator: "AND", conditionals: [] },
    ],
    actions: [{ id: "a", type: "SHOW_BLOCKS", showBlocks: [target] }],
  };

  schema.pages[0]!.blocks.push(rule);
  expect(projectLogicRules(schema).supportedActions.size).toBe(0);
  expect(logicIssues(schema).some((issue) => issue.code === "incomplete-condition")).toBe(true);
  rule.conditionals.pop();
  rule.actions[0]!.showBlocks!.push("missing-target");
  expect(projectLogicRules(schema).supportedActions.size).toBe(0);
  expect(field.shownWhen).toBeUndefined();
  expect(field.hidden).toBe(true);
});

test("whole-question Show does not consume independently hidden fragments of a partly visible question", () => {
  const { editor, source, yesId, target } = legacy();
  const schema = compileForm(editor.getEditorState());

  const field = question(schema.pages[0]!.blocks, target);

  field.hidden = true;
  field.description = [
    { type: "text", id: "hint", style: "paragraph", markdown: "Independent hint", hidden: true },
  ];
  schema.pages[0]!.blocks.push({
    type: "logic",
    id: "rule",
    logicalOperator: "AND",
    conditionals: [{ id: "c", type: "SINGLE", field: source, comparison: "IS", value: yesId }],
    actions: [{ id: "a", type: "SHOW_BLOCKS", showBlocks: [target] }],
  });
  expect(projectLogicRules(schema).supportedActions.size).toBe(0);
  expect(field.shownWhen).toBeUndefined();
  expect(field.description[0]!.hidden).toBe(true);
  expect(field.hidden).toBe(true);
  field.titleHidden = true;
  field.description[0]!.hidden = false;
  expect(projectLogicRules(schema).supportedActions.size).toBe(0);
  expect(capabilityWarnings(schema)[0]?.message).toContain("Hide targets initially");
  field.description[0]!.hidden = true;
  expect(projectLogicRules(schema).supportedActions.size).toBe(1);
  expect(field.description[0]!.hidden).toBeUndefined();
});

test("a grouped-checkbox follow-up uses its widget baseline rather than internal option flags", () => {
  const editor = makeEditor();
  editor.update(
    () => {
      const grouped = $setDepth(
        $setSettings($createWidgetNode("checkbox-accordion"), {
          groups: [
            {
              id: "category",
              label: "Activities",
              options: [
                { id: "one", label: "Advice" },
                { id: "two", label: "Training" },
              ],
            },
          ],
        }),
        1,
      );

      $getRoot().append(
        $createFormTitleNode(),
        $createPageTitleNode(),
        $createQuestionNode().append($createTextNode("Need help?")),
        $createOptionNode("multiple-choice").append($createTextNode("Yes")),
        $setDepth($createQuestionNode().append($createTextNode("Choose activities")), 1),
        grouped,
        $createOptionNode("multiple-choice").append($createTextNode("No")),
      );
      settle();
      $migrateLegacyConditions();
    },
    { discrete: true },
  );
  const schema = compileForm(editor.getEditorState());

  const grouped = schema.pages[0]!.blocks.find(
    (block) => block.type === "question" && block.kind === "checkbox-accordion",
  )!;

  expect(grouped.shownWhen?.[0]).toMatchObject({ value: "yes" });
  expect(capabilityWarnings(schema)).toEqual([]);
});
