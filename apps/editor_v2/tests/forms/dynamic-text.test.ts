import { jsonSetting, jsonSettings } from "../helpers/serialized-test-data";
import { conditionalLogic } from "../../src/forms/core/logic";
import { createEditor } from "../helpers/default-form";
import { expect, test } from "vitest";
import { $createTextNode, $getRoot } from "lexical";
import { compileForm } from "../helpers/default-form";
import {
  compileWording,
  wordingComparisons,
  type WordingVariant,
} from "../../src/forms/core/dynamic-text";
import { $wordingChoices, $wordingSource } from "../../src/forms/features/logic/wording-queries";
import { $blockId, $setSettings, $settings } from "../../src/editor/core/document-state";
import {
  $createFormTitleNode,
  $createPageTitleNode,
  $createQuestionNode,
  $ensureBlockIds,
  $ensureQuestionFields,
  $formBlocks,
  $isInput,
  $isPageTitleNode,
  $questionKey,
  $shareQuestionSettings,
  $updateSettings,
} from "../../src/forms/editor/nodes";
import {
  $createInputNode,
  $createOptionNode,
  $createWidgetNode,
} from "../../src/forms/editor/answer-nodes";
import { formNodes } from "../helpers/default-form";

import { $normalizePageHeads } from "../../src/forms/features/pages/headings";
import { $duplicateBlocks } from "../../src/forms/editor/structure/blocks";
import { $migrateLegacyConditions } from "../../src/forms/features/logic/migration";
import { logicIssues } from "../../src/forms/editor/capabilities";

const targets = [
  {
    key: "who",
    fieldId: "application-for",
    stepId: "about-you",
    kind: "multiple-choice",
    options: [
      { id: "myself", value: "self" },
      { id: "other", value: "someone-else" },
    ],
  },
];

const row = (patch: Partial<WordingVariant> = {}): WordingVariant => ({
  id: "one",
  field: "who",
  operator: "equal",
  value: { option: "myself" },
  text: "Tell us about yourself",
  ...patch,
});

const makeEditor = () =>
  createEditor({
    nodes: formNodes,
    onError: (error) => {
      throw error;
    },
  });

function setup(migrate = false) {
  const editor = makeEditor();

  let field = "",
    option = "",
    page = "",
    question = "";

  editor.update(
    () => {
      const input = $createOptionNode("multiple-choice").append($createTextNode("Myself"));
      const head = $createPageTitleNode().append($createTextNode("Tell us about the person"));
      const label = $createQuestionNode().append($createTextNode("Their name"));
      $getRoot().append(
        $createFormTitleNode().append($createTextNode("Apply")),
        $createPageTitleNode(),
        $createQuestionNode().append($createTextNode("Application for")),
        input,
        $createOptionNode("multiple-choice").append($createTextNode("Someone else")),
        $createWidgetNode("page-break"),
        head,
        label,
        $createInputNode(),
      );
      $ensureBlockIds($getRoot());
      $ensureQuestionFields($getRoot());
      $shareQuestionSettings($getRoot());
      field = $questionKey(input);
      option = $blockId(input);
      page = head.getKey();
      question = label.getKey();
      const variants = jsonSetting([row({ field, value: { option } })]);
      $setSettings(head, { conditionalTitle: variants });
      $updateSettings(label, { conditionalLabel: variants });

      if (migrate) $migrateLegacyConditions();
    },
    { discrete: true },
  );

  return { editor, field, option, page, question };
}

test("wording preserves first-match order and resolves stable option references to exported values", () => {
  const rows = [
    row(),
    row({ id: "two", operator: "in", value: { options: ["other", "myself"] }, text: "Other text" }),
  ];

  const first = compileWording(rows, targets, "page");
  expect(first.issues).toEqual([]);
  expect(first.variants).toEqual([
    {
      targetFieldId: "application-for",
      targetStepId: "about-you",
      operator: "equal",
      value: "self",
      text: "Tell us about yourself",
    },
    {
      targetFieldId: "application-for",
      targetStepId: "about-you",
      operator: "in",
      value: ["someone-else", "self"],
      text: "Other text",
    },
  ]);

  const renamed = [
    {
      ...targets[0]!,
      fieldId: "renamed-id",
      stepId: "new-page",
      options: [{ id: "myself", value: "pinned-self" }, targets[0]!.options[1]!],
    },
  ];

  expect(compileWording(rows, renamed, "page").variants[0]).toMatchObject({
    targetFieldId: "renamed-id",
    targetStepId: "new-page",
    value: "pinned-self",
  });
  expect(compileWording([...rows].reverse(), targets, "page").variants[0]?.text).toBe("Other text");
});

test("native literal types and imported transforms survive, while exists always means has an answer", () => {
  for (const value of [false, true, 7, "seven", [1, 2], ["a", "b"]])
    expect(compileWording([row({ value })], targets, "q").variants[0]?.value).toEqual(value);
  expect(
    compileWording([row({ operator: "exists", value: false })], targets, "q").variants[0]?.value,
  ).toBe(true);
  expect(
    compileWording([row({ operator: "gte", value: 18, transform: "yearsSince" })], targets, "q")
      .variants[0]?.transform,
  ).toBe("yearsSince");
  expect(wordingComparisons("checkboxes")).toEqual(["in", "exists"]);
  expect(wordingComparisons("number")).toContain("gte");
  expect(wordingComparisons("text")).not.toContain("in");
});

test("missing targets/options, incomplete values and blank replacements have targeted diagnostics without changing drafts", () => {
  const rows = [
    row({ field: "deleted" }),
    row({ value: { option: "deleted-option" } }),
    row({ text: "  " }),
    row({ value: undefined }),
    row({ operator: "gte", value: "not a number" }),
  ];

  const before = JSON.stringify(rows);
  const result = compileWording(rows, targets, "target-question");
  expect(result.variants).toEqual([]);
  expect(result.issues.map((issue) => issue.code)).toContain("dynamic-text-reference");
  expect(result.issues.map((issue) => issue.code)).toContain("dynamic-text-empty");
  expect(result.issues.map((issue) => issue.code)).toContain("dynamic-text-condition");
  expect(result.issues.every((issue) => issue.where === "target-question")).toBe(true);
  expect(JSON.stringify(rows)).toBe(before);
  expect(compileWording("broken", targets, "page").issues).toHaveLength(1);
  expect(compileWording([null], targets, "page").issues).toHaveLength(1);
});

test("compiler keeps static fallback and one field identity while resolving migrated wording rules", () => {
  const { editor } = setup(true);
  const form = compileForm(editor.getEditorState());
  expect(form.pages[1]?.title).toBe("Tell us about the person");
  expect(form.pages[1]?.conditionalTitle?.[0]).toMatchObject({
    targetFieldId: "application-for",
    value: "myself",
    title: "Tell us about yourself",
  });
  const question = form.pages[1]!.blocks.find((block) => block.type === "question")!;
  expect(question.title).toBe("Their name");
  expect(question.conditionalLabel?.[0]).toMatchObject({ label: "Tell us about yourself" });
  expect(question.settings.conditionalLabel).toBeUndefined();
  expect(form.dynamicTextIssues).toBeUndefined();
  expect(form.pages[1]!.blocks).toHaveLength(1);
});

test("deleting a source keeps repairable logic conditions and surfaces a reference issue", () => {
  const { editor, field } = setup(true);
  editor.update(
    () =>
      $formBlocks()
        .filter((node) => $isInput(node) && $questionKey(node) === field)
        .forEach((node) => node.remove()),
    { discrete: true },
  );
  const form = compileForm(editor.getEditorState());
  expect(logicIssues(form).filter((issue) => issue.code === "missing-reference")).toHaveLength(2);
  editor.getEditorState().read(
    () => {
      const conditions = $formBlocks().flatMap((node) =>
        Array.isArray($settings(node).conditionals)
          ? conditionalLogic($settings(node)).conditionals.flatMap((condition) =>
              condition.type === "SINGLE" ? [condition] : [],
            )
          : [],
      );

      expect(conditions.map((condition) => condition.field)).toEqual([field, field]);
    },
    { editor: editor },
  );
});

test("wording pickers use prior answers, page titles exclude their page and repeating answers remain marked for imported refs", () => {
  const { editor } = setup();
  editor.update(
    () => {
      const blocks = $formBlocks();
      $setSettings(blocks[0]!, { repeatable: { min: 1, max: 3 } });
      $normalizePageHeads($getRoot());
    },
    { discrete: true },
  );
  editor.getEditorState().read(
    () => {
      const title = $formBlocks().filter($isPageTitleNode).at(-1)!;
      const choices = $wordingChoices(title);
      expect(choices[0]).toMatchObject({ before: true, repeating: true });
      expect(choices.at(-1)).toMatchObject({ before: false });
      expect($wordingSource(title)?.label).toBe("title");
      expect($wordingSource($formBlocks()[0]!)).toBeUndefined();
    },
    { editor: editor },
  );
});

test("duplicating a page remaps wording rows and internal references while preserving external references and literal text", () => {
  const editor = makeEditor();
  editor.update(
    () => {
      const external = $createInputNode();
      const page = $setSettings($createWidgetNode("page-break"), { folded: true });
      const title = $createPageTitleNode().append($createTextNode("Fallback page title"));
      const source = $createOptionNode("multiple-choice").append($createTextNode("First choice"));
      const other = $createOptionNode("multiple-choice").append($createTextNode("Second choice"));
      const label = $createQuestionNode().append($createTextNode("Fallback question label"));
      const answer = $createInputNode();
      $getRoot().append(
        $createFormTitleNode(),
        $createPageTitleNode(),
        $createQuestionNode().append($createTextNode("External answer")),
        external,
        page,
        title,
        $createQuestionNode().append($createTextNode("Internal choice")),
        source,
        other,
        label,
        answer,
      );
      $ensureBlockIds($getRoot());
      $ensureQuestionFields($getRoot());
      $shareQuestionSettings($getRoot());

      const field = $questionKey(source),
        option = $blockId(source),
        secondOption = $blockId(other),
        externalField = $questionKey(external);

      const variants = [
        row({ field, value: { option }, text: field }),
        row({
          id: "many",
          field,
          operator: "in",
          value: { options: [option, secondOption] },
          text: option,
        }),
        row({ id: "external", field: externalField, value: field, text: secondOption }),
      ];

      $setSettings(title, { conditionalTitle: jsonSetting(variants) });
      $updateSettings(label, { conditionalLabel: jsonSetting(variants) });
      const originals = $formBlocks();
      $duplicateBlocks([page]);
      const copies = $formBlocks().slice(originals.length);
      expect(copies).toHaveLength(7);

      const copiedTitle = copies[1]!,
        copiedSource = copies[3]!,
        copiedOther = copies[4]!,
        copiedLabel = copies[5]!,
        copiedAnswer = copies[6]!;

      expect($questionKey(copiedSource)).not.toBe(field);
      expect($blockId(copiedSource)).not.toBe(option);
      expect(copiedTitle.getTextContent()).toBe("Fallback page title");
      expect(copiedLabel.getTextContent()).toBe("Fallback question label");

      for (const [node, property] of [
        [copiedTitle, "conditionalTitle"],
        [copiedAnswer, "conditionalLabel"],
      ] as const) {
        const rows = $settings(node)[property];

        if (!Array.isArray(rows)) throw Error("Expected wording variants");
        expect(rows).toHaveLength(3);
        expect(rows[0]).toMatchObject({
          field: $questionKey(copiedSource),
          value: { option: $blockId(copiedSource) },
          text: field,
        });
        expect(rows[1]).toMatchObject({
          field: $questionKey(copiedSource),
          value: { options: [$blockId(copiedSource), $blockId(copiedOther)] },
          text: option,
        });
        expect(rows[2]).toMatchObject({ field: externalField, value: field, text: secondOption });
        expect(new Set(rows.map((entry) => jsonSettings(entry).id)).size).toBe(3);
        expect(
          rows.every(
            (entry) => !variants.some((original) => original.id === jsonSettings(entry).id),
          ),
        ).toBe(true);
      }

      expect($settings(title).conditionalTitle).toEqual(variants);
      expect($settings(answer).conditionalLabel).toEqual(variants);
    },
    { discrete: true },
  );
});

test("grouped choices resolve pinned and generated values in wording pickers and native output", () => {
  const editor = makeEditor();

  let sourceKey = "";

  editor.update(
    () => {
      const grouped = $setSettings($createWidgetNode("checkbox-accordion"), {
        groups: [
          {
            id: "category",
            label: "Permits",
            options: [
              { id: "music", label: "Music", optionValue: "amplified-music" },
              { id: "roads", label: "Road closure" },
            ],
          },
        ],
      });

      const title = $createPageTitleNode().append($createTextNode("About the permit"));
      $getRoot().append(
        $createFormTitleNode(),
        $createPageTitleNode(),
        $createQuestionNode().append($createTextNode("Which permits?")),
        grouped,
        $createWidgetNode("page-break"),
        title,
        $createQuestionNode().append($createTextNode("Location")),
        $createInputNode("address-lookup"),
      );
      $ensureBlockIds($getRoot());
      $ensureQuestionFields($getRoot());
      sourceKey = $questionKey(grouped);
      $setSettings(title, {
        conditionalTitle: jsonSetting([
          row({ field: sourceKey, operator: "in", value: { options: ["music", "roads"] } }),
        ]),
      });
      const choice = $wordingChoices(title).find((field) => field.key === sourceKey)!;
      expect(choice.options.map(({ id, value }) => ({ id, value }))).toEqual([
        { id: "music", value: "amplified-music" },
        { id: "roads", value: "road-closure" },
      ]);
      expect(choice.multiple).toBe(true);
      $migrateLegacyConditions();
    },
    { discrete: true },
  );
  expect(compileForm(editor.getEditorState()).pages[1]?.conditionalTitle?.[0]?.value).toEqual([
    "amplified-music",
    "road-closure",
  ]);
  editor.update(
    () => {
      const grouped = $formBlocks().find(
        (node) => $isInput(node) && $questionKey(node) === sourceKey,
      )!;

      $setSettings(grouped, {
        groups: [
          {
            id: "category",
            label: "Renamed",
            options: [
              { id: "music", label: "Live music", optionValue: "live-music" },
              { id: "roads", label: "Roads" },
            ],
          },
        ],
      });
    },
    { discrete: true },
  );
  expect(compileForm(editor.getEditorState()).pages[1]?.conditionalTitle?.[0]?.value).toEqual([
    "live-music",
    "roads",
  ]);
  expect(wordingComparisons("opening-hours", true)).toEqual(["exists"]);
  expect(wordingComparisons("address-lookup")).toEqual(["equal", "notEqual", "exists"]);
});
