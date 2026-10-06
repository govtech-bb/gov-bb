import { $createQuestionNode } from "../../src/forms/editor/nodes";
import { createEditor, fieldArrayKinds } from "../helpers/default-form";
import { expect, test } from "vitest";
import { HeadingNode } from "@lexical/rich-text";
import { $createTextNode, $getRoot } from "lexical";
import { $duplicateQuestion } from "../../src/forms/editor/structure/blocks";
import { $registryBlocks as $govbbField } from "../../src/forms/editor/registry-module";
import { addressLookupEntry } from "../../src/forms/features/address-lookup/insertion";
import { openingHoursEntry } from "../../src/forms/features/opening-hours/insertion";
import { checkboxAccordionEntry } from "../../src/forms/features/checkbox-accordion/insertion";
import { compileForm, preflight, type FormQuestion } from "../helpers/default-form";
import { newGroup } from "../../src/forms/features/checkbox-accordion/groups";
import { $fields } from "../../src/forms/features/logic/queries";
import { comparisons } from "../../src/forms/features/logic/comparisons";
import {
  $createFormTitleNode,
  $ensureBlockIds,
  $ensureQuestionFields,
  $isInput,
  $shareQuestionSettings,
} from "../../src/forms/editor/nodes";
import { $createShowHideNode } from "../../src/editor/modules/disclosure/nodes";
import { $createWidgetNode } from "../../src/forms/editor/answer-nodes";
import { $setDepth, $setSettings } from "../../src/editor/core/document-state";
import { formNodes } from "../helpers/default-form";
import {
  OPENING_HOURS_ERROR,
  OPENING_HOURS_PATTERN,
} from "../../src/forms/features/opening-hours/defaults";

const makeEditor = () =>
  createEditor({
    nodes: [...formNodes, HeadingNode],
    onError: (error) => {
      throw error;
    },
  });

const run = (editor: ReturnType<typeof makeEditor>, fn: () => void) =>
  editor.update(
    () => {
      fn();
      $ensureBlockIds($getRoot());
      $ensureQuestionFields($getRoot());
      $shareQuestionSettings($getRoot());
    },
    { discrete: true },
  );

const questions = (editor: ReturnType<typeof makeEditor>) =>
  compileForm(editor.getEditorState()).pages.flatMap((page) =>
    page.blocks.filter((block): block is FormQuestion => block.type === "question"),
  );

const entry = (kind: string) => {
  const descriptor = [addressLookupEntry, openingHoursEntry, checkboxAccordionEntry].find(
    (entry) => entry.kind === kind,
  )!;

  return { create: () => [$createQuestionNode(), ...descriptor.create()] };
};

test("all three catalog fields compile with stable answer identities, refs and JSON persistence", () => {
  const editor = makeEditor();
  run(editor, () =>
    $getRoot().append(
      $createFormTitleNode(),
      ...entry("address-lookup").create(),
      ...entry("opening-hours").create(),
      ...entry("checkbox-accordion").create(),
    ),
  );
  const fields = questions(editor);
  expect(fields.map((field) => field.ref)).toEqual([
    "components/address-lookup",
    "components/opening-hours",
    "components/generic-checkbox-accordion",
  ]);
  expect(new Set(fields.map((field) => field.id)).size).toBe(3);
  expect(fields[0]!.settings).toMatchObject({
    required: true,
    hasMinCharacters: true,
    minCharacters: 5,
    width: "long",
  });
  expect(fields[0]!.errors).toMatchObject({
    required: "Address is required",
    minLength: "Address must be at least 5 characters",
  });
  expect(fields[1]!.settings.pattern).toBe(OPENING_HOURS_PATTERN);
  expect(fields[1]!.errors).toMatchObject({
    required: "Add hours for at least one day",
    pattern: OPENING_HOURS_ERROR,
  });
  expect(fields[1]!.options).toEqual([]);
  expect(fields[2]!.options).toHaveLength(2);
  expect(fields[2]!.groups![0]!.optionIds).toEqual(fields[2]!.options.map((option) => option.id));
  expect(fields[2]!.settings.groups).toBeUndefined();
  const restored = makeEditor();
  restored.setEditorState(restored.parseEditorState(editor.getEditorState().toJSON()));
  expect(questions(restored)).toEqual(fields);
  expect(
    preflight(compileForm(editor.getEditorState())).filter(
      (issue) => !["no-confirmation", "no-declaration"].includes(issue.code),
    ),
  ).toEqual([]);
});

test("opening hours use registry pattern, supported array operators and no repeat-array setting", () => {
  const pattern = new RegExp(OPENING_HOURS_PATTERN);
  expect(pattern.test("Monday 09:00 - 17:00")).toBe(true);
  expect(pattern.test("Sunday 22:00 - 02:00")).toBe(true);
  expect(pattern.test("Monday 09:00 - 09:00")).toBe(false);
  expect(pattern.test("Monday 25:00 - 17:00")).toBe(false);
  const editor = makeEditor();
  run(editor, () => {
    $getRoot().append($createFormTitleNode(), ...$govbbField("GOVBB_OPENING_HOURS"));
    const field = $fields()[0]!;
    expect(field.multiple).toBe(true);
    expect(comparisons(field)).toEqual(["IS_EMPTY", "IS_NOT_EMPTY"]);
    expect(fieldArrayKinds.has(field.kind)).toBe(false);
  });
});

test("grouped choices expose stable option IDs to logic and retain pinned values and risk on duplicate", () => {
  const editor = makeEditor();
  const group = newGroup();
  group.higherRisk = true;
  group.options[0]!.optionValue = "advice";
  run(editor, () => {
    const nodes = entry("checkbox-accordion").create();
    $setSettings(nodes[1]!, {
      groups: [group],
      isDisabled: true,
      hideLabel: true,
      hasMinChoices: true,
      minChoices: 1,
    });
    $getRoot().append($createFormTitleNode(), ...nodes);
  });
  run(editor, () => {
    expect($fields()[0]!.options).toEqual(group.options.map((option) => [option.id, option.label]));
    expect(comparisons($fields()[0]!)).toContain("IS_EVERY_OF");
    $duplicateQuestion($getRoot().getChildren().find($isInput)!);
  });
  const fields = questions(editor);
  expect(fields).toHaveLength(2);
  expect(fields[0]!.id).not.toBe(fields[1]!.id);
  expect(fields[0]!.groups![0]!.id).not.toBe(fields[1]!.groups![0]!.id);
  expect(fields[0]!.options[0]!.id).not.toBe(fields[1]!.options[0]!.id);
  expect(fields[1]!.options[0]!.value).toBe("advice");
  expect(fields[1]!.groups![0]!.higherRisk).toBe(true);
  expect(fields[1]!.settings).toMatchObject({ isDisabled: true, hideLabel: true });
  expect(fields[1]!.errors.minSelection).toBe("Select at least 1");
});

test("new widgets compile within a disclosure and repeating page without new nesting semantics", () => {
  const editor = makeEditor();
  run(editor, () => {
    $getRoot().append(
      $createFormTitleNode(),
      $setSettings($createWidgetNode("page-break"), { repeatable: { min: 1, max: 3 } }),
      $createShowHideNode().append($createTextNode("Business hours")),
      ...$govbbField("GOVBB_OPENING_HOURS").map((node) => $setDepth(node, 1)),
    );
  });
  const schema = compileForm(editor.getEditorState());
  const hours = questions(editor)[0]!;
  expect(hours.kind).toBe("opening-hours");
  expect(schema.pages[1]!.behaviours?.[0]?.type).toBe("repeatable");
  expect(
    preflight(schema).filter((issue) => ["repeat-field", "choice-group"].includes(issue.code)),
  ).toEqual([]);
});

test("preflight reports pinned value collisions, malformed groups and unsupported repeating answers", () => {
  const editor = makeEditor();
  run(editor, () => {
    const group = newGroup();
    group.options.forEach((option) => (option.optionValue = "same"));
    $getRoot().append(
      $createFormTitleNode(),
      $setSettings($createWidgetNode("checkbox-accordion"), {
        groups: [group],
        fieldArray: { min: 1, max: 2 },
      }),
      $setSettings($createWidgetNode("checkbox-accordion"), { groups: [{ invalid: true }] }),
    );
  });
  const issues = preflight(compileForm(editor.getEditorState()));
  expect(issues.some((issue) => issue.code === "option-value")).toBe(true);
  expect(issues.some((issue) => issue.code === "choice-group")).toBe(true);
  expect(issues.some((issue) => issue.code === "field-array-kind")).toBe(true);
});
