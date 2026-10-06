import { settingsObject, settingsArray } from "../helpers/serialized-test-data";
import { legacyFieldAdapter } from "../../src/forms/legacy";
import { expect, test } from "vitest";
import { $createParagraphNode, $createTextNode, $getRoot, type LexicalNode } from "lexical";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import { govbbFormEditor } from "../../src/presets/govbb-form";
import { createFormRuntime } from "../../src/forms/editor/runtime";
import { createDraftCodec } from "../helpers/default-form";
import { $duplicateBlocks } from "../../src/forms/editor/structure/blocks";
import { $fields } from "../../src/forms/features/logic/queries";
import { $blockId, $setDepth, $setSettings, $settings } from "../../src/editor/core/document-state";
import {
  $blockKind,
  $createFormTitleNode,
  $createPageTitleNode,
  $createQuestionNode,
  $ensureBlockIds,
  $ensureQuestionFields,
  $questionKey,
} from "../../src/forms/editor/nodes";
import { $createWidgetNode } from "../../src/forms/editor/answer-nodes";
import { checkboxAccordionField } from "../../src/forms/features/checkbox-accordion/definition";
import {
  groupedChoices,
  type GroupDraft,
} from "../../src/forms/features/checkbox-accordion/groups";
import type { Settings } from "../../src/forms/core/settings";

const groups: GroupDraft[] = [
  {
    id: "regulated-category",
    label: "Regulated services",
    higherRisk: true,
    options: [
      { id: "advice-option", label: "Advice", optionValue: "approved" },
      { id: "training-option", label: "Training", optionValue: "declined" },
    ],
  },
  {
    id: "other-category",
    label: "Other services",
    options: [
      // A submitted value can deliberately equal an old identity; it is still literal data.
      { id: "support-option", label: "Support", optionValue: "advice-option" },
      { id: "guidance-option", label: "Guidance" },
    ],
  },
];

const literal = { field: "advice-option", text: "regulated-category", nested: ["training-option"] };

const codec = createDraftCodec(createFormRuntime(govbbFormEditor));

const parts = (nodes: LexicalNode[]) => ({
  page: nodes.find((node) => $blockKind(node) === "page-break")!,
  answer: nodes.find((node) => $blockKind(node) === "checkbox-accordion")!,
  rule: nodes.find((node) => $blockKind(node) === "conditional-logic")!,
  paragraph: nodes.find((node) => node.getType() === "paragraph")!,
});

function fixture() {
  const editor = createHeadlessEditor(govbbFormEditor, undefined, { prepare: false });

  let original: LexicalNode[] = [],
    copies: LexicalNode[][] = [];

  let originalSettings: Settings = {};
  editor.update(
    () => {
      const page = $createWidgetNode("page-break");

      const answer = $setSettings($createWidgetNode("checkbox-accordion"), {
        required: true,
        isDisabled: true,
        groups: structuredClone(groups),
        opaque: literal,
        hasMinChoices: true,
        minChoices: 1,
        errors: { required: "Choose at least one service" },
      });

      const paragraph = $createParagraphNode().append(
        $createTextNode("Keep advice-option as ordinary prose"),
      );

      const rule = $createWidgetNode("conditional-logic");
      original = [
        page,
        $createPageTitleNode().append($createTextNode("Services")),
        $createQuestionNode().append($createTextNode("Which services?")),
        answer,
        paragraph,
        rule,
      ];
      $getRoot().append(
        $setSettings($createFormTitleNode().append($createTextNode("Application")), {
          logicVersion: 2,
        }),
        $createPageTitleNode().append($createTextNode("Start")),
        $createParagraphNode().append($createTextNode("Introduction")),
        ...original.map((node) => $setDepth(node, 0)),
      );
      $ensureBlockIds($getRoot());
      $ensureQuestionFields($getRoot());
      const field = $questionKey(answer);
      $setSettings(rule, {
        isDisabled: true,
        logicalOperator: "AND",
        opaque: literal,
        conditionals: [
          {
            id: "nested",
            type: "GROUP",
            disabled: true,
            logicalOperator: "OR",
            conditionals: [
              {
                id: "one",
                type: "SINGLE",
                field,
                comparison: "CONTAINS",
                value: "advice-option",
                disabled: true,
              },
              {
                id: "many",
                type: "SINGLE",
                field,
                comparison: "IS_ANY_OF",
                value: ["training-option", "support-option"],
              },
              {
                id: "literal",
                type: "SINGLE",
                field,
                comparison: "CONTAINS",
                value: "advice-option",
                valueIsLiteral: true,
              },
              {
                id: "literals",
                type: "SINGLE",
                field,
                comparison: "IS_ANY_OF",
                value: ["training-option", "support-option"],
                valueIsLiteral: true,
              },
            ],
          },
        ],
        actions: [
          {
            id: "retained",
            type: "CHANGE_LABEL",
            disabled: true,
            changeLabel: { target: field, text: "advice-option" },
            // These payloads are inactive while CHANGE_LABEL is selected, but remain editable later.
            jumpToPage: $blockId(page),
            requireAnswer: field,
            showBlocks: [$blockId(paragraph), "regulated-category", "advice-option"],
            hideBlocks: ["other-category", "training-option"],
            changePageTitle: { target: $blockId(page), text: "regulated-category" },
            calculate: {
              field,
              operator: "FORMULA",
              value: { field },
              expression: `{{${field}}} + 1`,
            },
          },
          {
            id: "no-active-type",
            requireAnswer: field,
            calculate: { field, value: "advice-option" },
            changeLabel: { target: field, text: "training-option" },
          },
        ],
      });
      originalSettings = structuredClone($settings(rule));

      for (let i = 0; i < 2; i++) {
        const before = new Set(
          $getRoot()
            .getChildren()
            .map((node) => node.getKey()),
        );

        $duplicateBlocks(original);
        copies.push(
          $getRoot()
            .getChildren()
            .filter((node) => !before.has(node.getKey())),
        );
      }
    },
    { discrete: true },
  );

  return { editor, original, copies, originalSettings };
}

function assertCopy(nodes: LexicalNode[]) {
  const { page, answer, rule, paragraph } = parts(nodes);
  const copied = groupedChoices($settings(answer));
  const field = $questionKey(answer);
  const [regulated, other] = copied;

  const advice = regulated!.options[0]!.id,
    training = regulated!.options[1]!.id,
    support = other!.options[0]!.id;

  expect(
    copied.map(({ id: _id, options, ...group }) => ({
      ...group,
      options: options.map(({ id: _id, ...option }) => option),
    })),
  ).toEqual(
    groups.map(({ id: _id, options, ...group }) => ({
      ...group,
      options: options.map(({ id: _id, ...option }) => option),
    })),
  );
  expect($settings(answer)).toMatchObject({
    required: true,
    isDisabled: true,
    hasMinChoices: true,
    minChoices: 1,
    errors: { required: "Choose at least one service" },
    opaque: literal,
  });
  expect(
    legacyFieldAdapter(checkboxAccordionField)!.project!($settings(answer)).options.map(
      (option) => option.value,
    ),
  ).toEqual(["approved", "declined", "advice-option", "guidance"]);
  expect($fields().find((row) => row.key === field)).toMatchObject({
    multiple: true,
    options: copied.flatMap((group) => group.options.map((option) => [option.id, option.label])),
  });
  expect($settings(rule)).toMatchObject({
    isDisabled: true,
    opaque: literal,
    conditionals: [
      {
        id: "nested",
        type: "GROUP",
        disabled: true,
        logicalOperator: "OR",
        conditionals: [
          {
            id: "one",
            type: "SINGLE",
            field,
            comparison: "CONTAINS",
            value: advice,
            disabled: true,
          },
          {
            id: "many",
            type: "SINGLE",
            field,
            comparison: "IS_ANY_OF",
            value: [training, support],
          },
          {
            id: "literal",
            type: "SINGLE",
            field,
            comparison: "CONTAINS",
            value: "advice-option",
            valueIsLiteral: true,
          },
          {
            id: "literals",
            type: "SINGLE",
            field,
            comparison: "IS_ANY_OF",
            value: ["training-option", "support-option"],
            valueIsLiteral: true,
          },
        ],
      },
    ],
    actions: [
      {
        id: "retained",
        type: "CHANGE_LABEL",
        disabled: true,
        changeLabel: { target: field, text: "advice-option" },
        jumpToPage: $blockId(page),
        requireAnswer: field,
        showBlocks: [$blockId(paragraph), regulated!.id, advice],
        hideBlocks: [other!.id, training],
        changePageTitle: { target: $blockId(page), text: "regulated-category" },
        calculate: { field, operator: "FORMULA", value: { field }, expression: `{{${field}}} + 1` },
      },
      {
        id: "no-active-type",
        requireAnswer: field,
        calculate: { field, value: "advice-option" },
        changeLabel: { target: field, text: "training-option" },
      },
    ],
  });
  expect(paragraph.getTextContent()).toBe("Keep advice-option as ordinary prose");

  return [...nodes.map($blockId), field, ...checkboxAccordionField.ownedIds!($settings(answer))];
}

test("two grouped question copies get independent identities and remap inactive references without rewriting values", () => {
  const { editor, original, copies, originalSettings } = fixture();

  try {
    editor.getEditorState().read(
      () => {
        expect(copies.map((copy) => copy.length)).toEqual([original.length, original.length]);
        expect(groupedChoices($settings(parts(original).answer))).toEqual(groups);
        expect($settings(parts(original).rule)).toEqual(originalSettings);
        const identities = [original, ...copies].map(assertCopy);
        const originalIds = new Set(identities[0]);
        expect(identities[1]!.some((id) => originalIds.has(id))).toBe(false);
        const firstCopyIds = new Set(identities[1]);
        expect(identities[2]!.some((id) => originalIds.has(id) || firstCopyIds.has(id))).toBe(
          false,
        );
      },
      { editor },
    );
  } finally {
    editor.dispose();
  }
});

test("copied grouped identities and retained logic payloads survive canonical source reload", () => {
  const { editor } = fixture();

  try {
    const source = codec.encode(editor.getEditorState().toJSON());
    const loaded = codec.prepare(source);
    expect(codec.encode(loaded.state)).toBe(source);
    const restored = createHeadlessEditor(govbbFormEditor, loaded.state, { prepare: false });

    try {
      restored.getEditorState().read(
        () => {
          const pages: LexicalNode[][] = [];

          for (const node of $getRoot().getChildren()) {
            if ($blockKind(node) === "page-break") pages.push([]);
            pages.at(-1)?.push(node);
          }

          expect(pages).toHaveLength(3);
          pages.forEach(assertCopy);
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

test("field copy hooks isolate unknown nested group, option and field settings", () => {
  const original = {
    groups: [
      {
        id: "category",
        label: "Services",
        futureGroup: { labels: ["retained"] },
        options: [
          {
            id: "option",
            label: "Advice",
            optionValue: "approved",
            futureOption: { labels: ["retained"] },
          },
        ],
      },
    ],
    futureField: { labels: ["retained"] },
  };

  const first = checkboxAccordionField.copySettings!(original);
  const second = checkboxAccordionField.copySettings!(original);
  const firstGroup = settingsObject(settingsArray(first.groups)[0]);
  settingsArray(settingsObject(firstGroup.futureGroup).labels)[0] = "changed";
  settingsArray(
    settingsObject(settingsObject(settingsArray(firstGroup.options)[0]).futureOption).labels,
  )[0] = "changed";
  settingsArray(settingsObject(first.futureField).labels)[0] = "changed";

  for (const unchanged of [original, second]) {
    const group = settingsObject(settingsArray(unchanged.groups)[0]);
    expect(settingsObject(group.futureGroup).labels).toEqual(["retained"]);
    expect(
      settingsObject(settingsObject(settingsArray(group.options)[0]).futureOption).labels,
    ).toEqual(["retained"]);
    expect(settingsObject(unchanged.futureField).labels).toEqual(["retained"]);
  }
});
