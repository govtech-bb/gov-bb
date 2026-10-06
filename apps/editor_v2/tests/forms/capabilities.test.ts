import { createEditor } from "../helpers/default-form";
import { LinkNode } from "@lexical/link";
import { HeadingNode } from "@lexical/rich-text";
import { expect, test } from "vitest";
import { $createParagraphNode, $getRoot } from "lexical";
import { capabilityWarnings, logicIssues } from "../../src/forms/editor/capabilities";
import { compileForm, type FormLogic } from "../helpers/default-form";
import { $legacyDemo as $demo } from "../helpers/legacy-demo";
import { $createMentionNode, MentionNode } from "../../src/forms/features/mentions/node";
import { $blockId, $setSettings } from "../../src/editor/core/document-state";
import { $createOptionNode } from "../../src/forms/editor/answer-nodes";
import {
  $ensureBlockIds,
  $ensureQuestionFields,
  $shareQuestionSettings,
} from "../../src/forms/editor/nodes";
import { formNodes } from "../helpers/default-form";

const editor = () =>
  createEditor({
    nodes: [...formNodes, HeadingNode, LinkNode, MentionNode],
    onError: (e) => {
      throw e;
    },
  });

const draft = () => {
  const e = editor();
  e.update(
    () => {
      $demo();
      $ensureBlockIds($getRoot());
      $shareQuestionSettings($getRoot());
      $ensureQuestionFields($getRoot());
    },
    { discrete: true },
  );

  return e;
};

test("native demo, nesting and repetition do not produce compatibility warnings", () => {
  const state = draft().getEditorState();
  expect(capabilityWarnings(compileForm(state), state)).toEqual([]);
});

test("manual actions are reported by action, while malformed formulas remain correctness errors", () => {
  const schema = compileForm(draft().getEditorState());
  const field = schema.pages[0]!.blocks.find((block) => block.type === "question")!.id;

  const logic: FormLogic = {
    type: "logic",
    id: "rule",
    logicalOperator: "AND",
    conditionals: [{ type: "SINGLE", id: "c", field, comparison: "IS", value: "Yes" }],
    actions: [
      { id: "a", type: "SHOW_BLOCKS", showBlocks: [field] },
      { id: "b", type: "JUMP_TO_PAGE", jumpToPage: "start" },
    ],
  };

  schema.pages[0]!.blocks.push(logic);
  expect(capabilityWarnings(schema).map((issue) => issue.code)).toEqual([
    "ssb-action-show_blocks",
    "ssb-action-jump_to_page",
  ]);
  logic.actions = [
    { id: "a", type: "CALCULATE", calculate: { field, operator: "FORMULA", expression: "1 +" } },
  ];
  expect(logicIssues(schema).map((issue) => issue.code)).toEqual(["formula"]);
  expect(capabilityWarnings(schema)).toEqual([]);
});

test("missing formula and condition references are errors, with stable calculated-row warning targets", () => {
  const schema = compileForm(draft().getEditorState());
  schema.pages[0]!.blocks.push({
    type: "calculated-fields",
    id: "calc",
    fields: [{ key: "calc:one", name: "Total", type: "NUMBER" }],
  });
  expect(capabilityWarnings(schema).map((issue) => issue.where)).toEqual(["calc:one"]);
  schema.pages[0]!.blocks.push({
    type: "logic",
    id: "rule",
    logicalOperator: "AND",
    conditionals: [{ type: "SINGLE", id: "c", field: "missing", comparison: "IS_EMPTY" }],
    actions: [
      {
        id: "a",
        type: "CALCULATE",
        calculate: { field: "calc:one", operator: "FORMULA", expression: "{{missing}} + 1" },
      },
    ],
  });
  expect(logicIssues(schema)).toHaveLength(1);
  expect(logicIssues(schema)[0]!.code).toBe("missing-reference");
});

test("raw imported disabled options and answer mentions are retained and warned once per source", () => {
  const e = draft();
  let option = "";
  e.update(
    () => {
      const node = $setSettings($createOptionNode(), { disabled: true });
      const enabled = $createOptionNode();
      $getRoot().append(
        node,
        enabled,
        $createParagraphNode().append(
          $createMentionNode("id", "ID"),
          $createMentionNode("id", "ID"),
        ),
      );
      $ensureBlockIds($getRoot());
      $shareQuestionSettings($getRoot());
      $ensureQuestionFields($getRoot());
      option = $blockId(node);
    },
    { discrete: true },
  );
  const state = e.getEditorState();
  const warnings = capabilityWarnings(compileForm(state), state);
  expect(warnings.filter((issue) => issue.code === "ssb-answer-mention")).toHaveLength(1);
  expect(warnings.filter((issue) => issue.code === "ssb-disabled-option")).toHaveLength(1);
  expect(warnings.find((issue) => issue.code === "ssb-disabled-option")!.where).toBe(option);
});

test("folded editor state is harmless, unsupported imported blocks are identified", () => {
  const schema = compileForm(draft().getEditorState());
  schema.pages[0]!.blocks.push({
    type: "widget",
    kind: "legacy-payment",
    id: "payment",
    settings: { folded: true },
  });
  expect(capabilityWarnings(schema).map((issue) => [issue.code, issue.where])).toEqual([
    ["ssb-widget", "payment"],
  ]);
});

test("a missing answer mention is a correctness error and its source is retained", () => {
  const e = draft();
  e.update(
    () => {
      $getRoot().append(
        $createParagraphNode().append($createMentionNode("removed-answer", "Previous answer")),
      );
      $ensureBlockIds($getRoot());
    },
    { discrete: true },
  );
  const state = e.getEditorState();
  const schema = compileForm(state);
  expect(logicIssues(schema, state).map((issue) => issue.code)).toEqual(["missing-reference"]);
  expect(capabilityWarnings(schema, state)).toEqual([]);
  expect(JSON.stringify(state)).toContain("removed-answer");
});
