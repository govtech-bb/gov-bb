import { createEditor } from "../helpers/default-form";
import { LinkNode } from "@lexical/link";
import { HeadingNode } from "@lexical/rich-text";
import { expect, test } from "vitest";
import { $createTextNode, $getRoot } from "lexical";
import { compileForm } from "../helpers/default-form";
import { MentionNode } from "../../src/forms/features/mentions/node";
import {
  $createFormTitleNode,
  $createPageTitleNode,
  $createQuestionNode,
  $ensureBlockIds,
  $ensureQuestionFields,
  $questionKey,
} from "../../src/forms/editor/nodes";
import { $createInputNode, $createWidgetNode } from "../../src/forms/editor/answer-nodes";
import { $setSettings } from "../../src/editor/core/document-state";
import { formNodes } from "../helpers/default-form";
import { newGroup } from "../../src/forms/features/checkbox-accordion/groups";
import { fromEditor, readMarkdown, toEditor, writeMarkdown } from "../helpers/default-form";
import { prepareSource } from "../helpers/default-form";
import { COMPONENTS } from "../../src/presets/form-registry/components";

const makeEditor = () =>
  createEditor({
    nodes: [...formNodes, HeadingNode, LinkNode, MentionNode],
    onError: (error) => {
      throw error;
    },
  });

test("canonical markdown keeps new field settings, grouped option references, conditional labels and age rules together", () => {
  const editor = makeEditor();
  editor.update(
    () => {
      const group = newGroup();
      group.label = "Business types";
      group.higherRisk = true;
      group.options[0]!.label = "Food";
      group.options[0]!.optionValue = "food-business";

      const choices = $setSettings($createWidgetNode("checkbox-accordion"), {
        groups: [group],
        required: true,
      });

      const date = $createInputNode("date");
      const time = $setSettings($createInputNode("time"), { step: 90, isDisabled: true });
      const title = $createQuestionNode().append($createTextNode("Closing time"));
      const logic = $createWidgetNode("conditional-logic");
      $getRoot().append(
        $setSettings($createFormTitleNode().append($createTextNode("Business application")), {
          logicVersion: 2,
        }),
        $createPageTitleNode().append($createTextNode("Business details")),
        $createQuestionNode().append($createTextNode("Business types")),
        choices,
        $createQuestionNode().append($createTextNode("Date of birth")),
        date,
        title,
        time,
        logic,
      );
      $ensureBlockIds($getRoot());
      $ensureQuestionFields($getRoot());
      $getRoot().append(
        $setSettings($createWidgetNode("conditional-logic"), {
          logicalOperator: "AND",
          conditionals: [
            {
              id: "wording",
              type: "SINGLE",
              field: $questionKey(choices),
              comparison: "CONTAINS",
              value: group.options[0]!.id,
            },
          ],
          actions: [
            {
              id: "change-label",
              type: "CHANGE_LABEL",
              changeLabel: { target: $questionKey(time), text: "Kitchen closing time" },
            },
          ],
        }),
      );
      $ensureBlockIds($getRoot());
      $setSettings(logic, {
        conditionals: [
          {
            id: "age",
            type: "SINGLE",
            field: $questionKey(date),
            comparison: "GREATER_OR_EQUAL_THAN",
            transform: "yearsSince",
            value: 18,
          },
        ],
        actions: [{ id: "require", type: "REQUIRE_ANSWER", requireAnswer: $questionKey(time) }],
      });
    },
    { discrete: true },
  );
  const before = compileForm(editor.getEditorState());
  const source = writeMarkdown(fromEditor(editor.getEditorState().toJSON()));
  const parsed = readMarkdown(source);
  expect(parsed.diagnostics.filter((issue) => issue.severity === "fatal")).toEqual([]);
  const hydrated = makeEditor();
  hydrated.setEditorState(hydrated.parseEditorState(toEditor(parsed.document!)));
  const after = compileForm(hydrated.getEditorState());
  const beforeFields = before.pages[0]!.blocks.filter((block) => block.type === "question");
  const afterFields = after.pages[0]!.blocks.filter((block) => block.type === "question");
  expect(afterFields.map((field) => field.kind)).toEqual(["checkbox-accordion", "date", "time"]);
  expect(afterFields[0]!.options.map((option) => [option.label, option.value])).toEqual(
    beforeFields[0]!.options.map((option) => [option.label, option.value]),
  );
  expect(afterFields[0]!.groups?.[0]!.higherRisk).toBe(true);
  expect(
    afterFields.every(
      (field) =>
        field.settings.sourceKey === undefined && field.settings.sourceExplicit === undefined,
    ),
  ).toBe(true);
  expect(afterFields[2]!.settings.step).toBe(90);
  expect(afterFields[2]!.settings.isDisabled).toBe(true);
  expect(beforeFields[2]!.conditionalLabel?.[0]?.label).toBe("Kitchen closing time");
  expect(beforeFields[2]!.conditionalLabel?.[0]?.value).toEqual(["food-business"]);
  expect(afterFields[2]!.conditionalLabel).toEqual(beforeFields[2]!.conditionalLabel);
  const logic = after.pages[0]!.blocks.find((block) => block.type === "logic")!;
  expect(logic.conditionals[0]).toMatchObject({
    field: afterFields[1]!.id,
    transform: "yearsSince",
    value: 18,
  });
  expect(logic.actions[0]!.requireAnswer).toBe(afterFields[2]!.id);
  expect(writeMarkdown(fromEditor(hydrated.getEditorState().toJSON()))).toBe(source);
});

test("version 1 followups and wording migrate once; deleting the new rules survives reload", () => {
  const source =
    '---\nformat: govbb-form\nformatVersion: 1\ntitle: Business\n---\n\n# Type\n\n::multiple-choice[Application type]{#type}\n- :option[Business]{#business optionValue="business"}\n\n  ::text[Trading name]{#trading-name}\n\n- Person\n\n---\n\n# Details\n::page{#details}\n\n::text[Name]{#name}\n';

  const legacy = readMarkdown(source).document!;
  const question = legacy.pages[0]!.blocks[0]!;

  if (question.type !== "question") throw Error("Expected choice question");
  question.settings.conditionalLabel = [
    {
      id: "wording",
      field: "type",
      operator: "equal",
      value: "business",
      text: "Business application type",
    },
  ];
  legacy.pages[1]!.titleNode = {
    settings: {
      conditionalTitle: [
        {
          id: "page-wording",
          field: "type",
          operator: "equal",
          value: { option: "business" },
          text: "Business details",
        },
      ],
    },
  };
  const prepared = prepareSource(writeMarkdown(legacy));
  expect(prepared.migrated).toBe(true);
  const migrated = readMarkdown(prepared.source).document!;
  expect(migrated.formatVersion).toBe(2);
  expect(prepared.source).not.toContain('"conditionalLabel"');
  expect(prepared.source).not.toContain('"conditionalTitle"');
  const loaded = makeEditor();
  loaded.setEditorState(loaded.parseEditorState(prepared.state));
  const schema = compileForm(loaded.getEditorState());

  const rules = schema.pages
    .flatMap((page) => page.blocks)
    .filter((block) => block.type === "logic");

  expect(rules).toHaveLength(3);
  expect(
    rules
      .flatMap((rule) => rule.actions)
      .map((action) => action.type)
      .sort(),
  ).toEqual(["CHANGE_LABEL", "CHANGE_PAGE_TITLE", "SHOW_BLOCKS"]);
  expect(
    schema.pages[0]!.blocks.find(
      (block) => block.type === "question" && block.title === "Application type",
    ),
  ).toMatchObject({
    conditionalLabel: [{ label: "Business application type", value: "business" }],
  });
  expect(schema.pages[1]!.conditionalTitle).toMatchObject([
    { title: "Business details", value: "business" },
  ]);
  expect(
    schema.pages[0]!.blocks.find(
      (block) => block.type === "question" && block.title === "Trading name",
    ),
  ).toMatchObject({ shownWhen: [{ type: "fieldConditionalOn", value: "business" }] });
  expect(prepareSource(prepared.source).source).toBe(prepared.source);

  for (const page of migrated.pages)
    page.blocks = page.blocks.filter((block) => block.type !== "content" || block.kind !== "logic");
  const withoutRules = prepareSource(writeMarkdown(migrated));
  expect(withoutRules.migrated).toBeUndefined();
  expect(withoutRules.source).not.toContain(":::logic");
  expect(prepareSource(withoutRules.source).source).toBe(withoutRules.source);
  const noRules = makeEditor();
  noRules.setEditorState(noRules.parseEditorState(withoutRules.state));
  const after = compileForm(noRules.getEditorState());
  expect(
    after.pages.flatMap((page) => page.blocks).filter((block) => block.type === "logic"),
  ).toHaveLength(0);
  expect(
    after.pages[0]!.blocks.find(
      (block) => block.type === "question" && block.title === "Trading name",
    ),
  ).toMatchObject({ hidden: true });
  expect(after.pages[1]!.conditionalTitle).toBeUndefined();
});

test("both source versions expand Team shorthand from frozen defaults despite registry changes", () => {
  const preset = COMPONENTS["components/country"]!;
  const original = { options: preset.options, label: preset.label };

  try {
    preset.options = [
      { id: "new-registry-option", label: "New registry option", value: "new-value" },
    ];
    preset.label = "New country";

    for (const version of [1, 2]) {
      const prepared = prepareSource(
        `---\nformat: govbb-form\nformatVersion: ${version}\ntitle: Test\n---\n\n# Details\n\n::dropdown[Country]{#country preset="country"}\n`,
      );

      const editor = makeEditor();
      editor.setEditorState(editor.parseEditorState(prepared.state));

      const field = compileForm(editor.getEditorState()).pages[0]!.blocks.find(
        (block) => block.type === "question",
      )!;

      expect(field.fieldId).toBe("country");
      expect(
        field.options.find((option) => option.label === "Democratic Republic of the Congo")?.value,
      ).toBe("dr-congo");
      expect(field.options.some((option) => option.label === "New registry option")).toBe(false);
      expect(prepareSource(prepared.source).source).toBe(prepared.source);
    }
  } finally {
    Object.assign(preset, original);
  }
});

test("Team shorthand keeps edited labels and explicit removal of inherited snapshot defaults", () => {
  const base =
    '---\nformat: govbb-form\nformatVersion: 1\ntitle: Test\n---\n\n# Details\n\n::text[National Identification (ID) number]{#identity preset="national-id-number"}\n';

  const document = readMarkdown(base).document!;
  const question = document.pages[0]!.blocks[0]!;

  if (question.type !== "question") throw Error("Expected question");
  delete question.settings.sourceFieldId;
  delete question.settings.sourceLabel;
  const source = writeMarkdown(document);
  expect(source).toContain('"removeSettings"');
  const prepared = prepareSource(source);
  const editor = makeEditor();
  editor.setEditorState(editor.parseEditorState(prepared.state));

  const field = compileForm(editor.getEditorState()).pages[0]!.blocks.find(
    (block) => block.type === "question",
  )!;

  expect(field.fieldId).toBe("identity");
  expect(field.title).toBe("National Identification (ID) number");
  expect(field.settings.sourceFieldId).toBeUndefined();
  expect(field.settings.sourceLabel).toBeUndefined();
  expect(prepareSource(prepared.source).source).toBe(prepared.source);

  const renamed = prepareSource(
    base.replace("[National Identification (ID) number]", "[Your identification number]"),
  );

  const renamedEditor = makeEditor();
  renamedEditor.setEditorState(renamedEditor.parseEditorState(renamed.state));
  expect(
    compileForm(renamedEditor.getEditorState()).pages[0]!.blocks.find(
      (block) => block.type === "question",
    ),
  ).toMatchObject({ fieldId: "national-id-number", title: "Your identification number" });
});
