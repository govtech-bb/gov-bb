import { legacyFieldAdapter } from "../../src/forms/legacy";
import { expect, test } from "vitest";
import { $getRoot, type LexicalNode } from "lexical";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import { executeAction } from "../../src/editor/core/actions";
import { $settings, $setSettings } from "../../src/editor/core/document-state";
import { govbbFormEditor } from "../../src/presets/govbb-form";
import { createFormRuntime } from "../../src/forms/editor/runtime";
import { createDraftCodec, readMarkdown, toEditor } from "../helpers/default-form";
import { lexicalToLegacySsb } from "../../src/converters/lexicalToLegacySsb";
import { openingHoursField } from "../../src/forms/features/opening-hours/definition";
import {
  OPENING_HOURS_PATTERN,
  OPENING_HOURS_ERROR,
} from "../../src/forms/features/opening-hours/defaults";
import { checkboxAccordionField } from "../../src/forms/features/checkbox-accordion/definition";
import {
  newGroup,
  copyGroups,
  groupedChoices,
} from "../../src/forms/features/checkbox-accordion/groups";
import { $native } from "../../src/forms/editor/native-state";
import { $setFormSettings } from "../../src/forms/editor/native-settings";
import { serializedToNativeForm } from "../../src/forms/editor/native-bindings";
import type { ChoiceConfig, QuestionOption } from "../../src/forms/schema/types";

const emptySource =
  '---\nformat: govbb-form\nformatVersion: 2\ntitle: Apply\n---\n\n# Application\n\n::page{#application}\n\n::empty\n\n---\n\n# Declaration\n\n::page{#declaration type="declaration"}\n\n::checkboxes[Declaration]{#legal required}\n- I confirm the information I have given is correct\n\n---\n\n# Complete\n\n::page{#complete type="confirmation"}\n';

const runtime = createFormRuntime(govbbFormEditor),
  codec = createDraftCodec(runtime);

const legacyEditorFor = () =>
  createHeadlessEditor(govbbFormEditor, toEditor(readMarkdown(emptySource).document!), {
    prepare: false,
  });

const field = (node: LexicalNode, kind: string) => {
  const serialized = node.exportJSON();

  return "widget" in serialized && serialized.widget === kind;
};

test("opening hours owns its complete copied defaults, pattern validation and limited capabilities", () => {
  expect(openingHoursField.defaults).toEqual({
    pattern: OPENING_HOURS_PATTERN,
    ref: "components/opening-hours",
    sourceFieldId: "opening-hours",
    sourceLabel: "Opening hours",
    errors: { required: "Add hours for at least one day", pattern: OPENING_HOURS_ERROR },
    required: true,
  });
  expect(openingHoursField.capabilities).toMatchObject({
    repeat: false,
    formula: true,
    mention: true,
    comparisons: ["IS_EMPTY", "IS_NOT_EMPTY"],
  });
  expect(legacyFieldAdapter(openingHoursField)!.rules(openingHoursField.defaults)).toEqual([
    { rule: "required", label: "When it's empty" },
    { rule: "pattern", label: "Wrong format", value: OPENING_HOURS_PATTERN },
  ]);
  expect(openingHoursField.validate({ pattern: "[" }, "hours")).toEqual([
    expect.objectContaining({ code: "pattern", where: "hours" }),
  ]);
  expect(
    legacyFieldAdapter(openingHoursField)!.settings({
      pattern: "custom",
      step: 60,
      width: "short",
      mask: "99",
      isDisabled: true,
    }),
  ).toEqual({ pattern: "custom", isDisabled: true });
});

test("grouped field projection preserves category and local option IDs, risk and pinned values", () => {
  const group = newGroup();
  group.label = "Regulated services";
  group.higherRisk = true;
  group.options[0]!.label = "Advice";
  group.options[0]!.optionValue = "approved";
  group.options[1]!.label = "Training";

  const raw = {
    required: true,
    groups: [group],
    hasMinChoices: true,
    minChoices: 1,
    hasMaxChoices: true,
    maxChoices: 2,
  };

  const projected = legacyFieldAdapter(checkboxAccordionField)!.project!(raw);
  expect(projected.groups).toEqual([
    {
      id: group.id,
      label: group.label,
      higherRisk: true,
      optionIds: group.options.map((option) => option.id),
    },
  ]);
  expect(projected.options.map((option) => [option.id, option.value])).toEqual([
    [group.options[0]!.id, "approved"],
    [group.options[1]!.id, "training"],
  ]);
  expect(
    legacyFieldAdapter(checkboxAccordionField)!
      .rules(raw)
      .map((rule) => [rule.rule, rule.value]),
  ).toEqual([
    ["required", undefined],
    ["minSelection", 1],
    ["maxSelection", 2],
  ]);
  expect(legacyFieldAdapter(checkboxAccordionField)!.settings(raw).groups).toBeUndefined();
  const duplicate = copyGroups([group]);
  expect(duplicate[0]!.id).not.toBe(group.id);
  expect(duplicate[0]!.options[0]!.id).not.toBe(group.options[0]!.id);
  expect(
    legacyFieldAdapter(checkboxAccordionField)!.project!({ groups: duplicate }).options.map(
      (option) => option.value,
    ),
  ).toEqual(["approved", "training"]);
});

test("specialized module insertions survive canonical source reload and legacy projection", () => {
  const editor = legacyEditorFor();

  try {
    const anchor = editor.getEditorState().read(
      () =>
        $getRoot()
          .getChildren()
          .find((node) => node.getType() === "paragraph")!
          .getKey(),
      { editor },
    );

    expect(
      executeAction(editor, govbbFormEditor, "question_OPENING_HOURS", { targetKey: anchor })
        .executed,
    ).toBe(true);

    const openingKey = editor.getEditorState().read(
      () =>
        $getRoot()
          .getChildren()
          .find((node) => field(node, "opening-hours"))!
          .getKey(),
      { editor },
    );

    expect(
      executeAction(editor, govbbFormEditor, "question_CHECKBOX_ACCORDION", {
        targetKey: openingKey,
      }).executed,
    ).toBe(true);
    let groups: ReturnType<typeof groupedChoices> = [];
    editor.update(
      () => {
        const opening = $getRoot()
          .getChildren()
          .find((node) => field(node, "opening-hours"))!;

        expect($settings(opening)).toMatchObject(openingHoursField.defaults);

        const accordion = $getRoot()
          .getChildren()
          .find((node) => field(node, "checkbox-accordion"))!;

        groups = structuredClone(groupedChoices($settings(accordion)));
        groups[0]!.higherRisk = true;
        groups[0]!.label = "Activities";
        groups[0]!.options[0]!.label = "Advice";
        groups[0]!.options[0]!.optionValue = "approved";
        $setSettings(accordion, { groups, hasMinChoices: true, minChoices: 1, isDisabled: true });
      },
      { discrete: true },
    );

    const state = editor.getEditorState().toJSON(),
      source = codec.encode(state),
      loaded = codec.prepare(source);

    expect(source).toContain("::opening-hours[");
    expect(source).toContain("::checkbox-accordion[");
    expect(codec.encode(loaded.state)).toBe(loaded.source);
    expect(codec.prepare(loaded.source).source).toBe(loaded.source);
    const restored = createHeadlessEditor(govbbFormEditor, loaded.state, { prepare: false });

    try {
      restored.getEditorState().read(
        () => {
          const accordion = $getRoot()
            .getChildren()
            .find((node) => field(node, "checkbox-accordion"))!;

          expect(groupedChoices($settings(accordion))).toEqual(groups);
        },
        { editor: restored },
      );
      const output = lexicalToLegacySsb(restored.getEditorState(), govbbFormEditor, restored);
      expect(
        output.diagnostics.filter((issue) =>
          ["choice-group", "unsupported-field-output"].includes(issue.code),
        ),
      ).toEqual([]);

      const questions = output.schema!.pages[0]!.blocks.filter(
        (block) => block.type === "question",
      );

      expect(questions.find((question) => question.kind === "opening-hours")).toMatchObject({
        ref: "components/opening-hours",
        settings: { pattern: OPENING_HOURS_PATTERN },
        errors: { required: "Add hours for at least one day", pattern: OPENING_HOURS_ERROR },
      });
      expect(questions.find((question) => question.kind === "checkbox-accordion")).toMatchObject({
        ref: "components/generic-checkbox-accordion",
        groups: [{ id: groups[0]!.id, higherRisk: true }],
        options: [
          { id: groups[0]!.options[0]!.id, value: "approved" },
          { id: groups[0]!.options[1]!.id, value: "option-2" },
        ],
        settings: { isDisabled: true, minChoices: 1 },
      });
    } finally {
      restored.dispose();
    }
  } finally {
    editor.dispose();
  }
});

test("group validation runs after projection and unsupported answer repetition remains a publish issue", () => {
  const editor = legacyEditorFor();

  try {
    const anchor = editor.getEditorState().read(
      () =>
        $getRoot()
          .getChildren()
          .find((node) => node.getType() === "paragraph")!
          .getKey(),
      { editor },
    );

    expect(
      executeAction(editor, govbbFormEditor, "question_CHECKBOX_ACCORDION", { targetKey: anchor })
        .executed,
    ).toBe(true);
    const group = newGroup();
    group.label = "";
    editor.update(
      () => {
        const accordion = $getRoot()
          .getChildren()
          .find((node) => field(node, "checkbox-accordion"))!;

        $setSettings(accordion, { groups: [group], fieldArray: { minItems: 1 } });
      },
      { discrete: true },
    );
    const result = lexicalToLegacySsb(editor.getEditorState(), govbbFormEditor, editor);
    expect(result.schema).not.toBeNull();
    expect(result.diagnostics).toContainEqual({
      code: "choice-group",
      where: group.id,
      message: "Enter a category label",
    });
    expect(result.diagnostics.some((issue) => issue.code === "field-array-kind")).toBe(true);
    const canonical = codec.encode(editor.getEditorState().toJSON());
    expect(codec.encode(codec.prepare(canonical).state)).toBe(canonical);
  } finally {
    editor.dispose();
  }
});

test("fresh native grouped choices retain defaults and edits through Markdown and native export", () => {
  const editor = createHeadlessEditor(govbbFormEditor, codec.prepare(emptySource).state, {
    prepare: false,
  });

  try {
    const anchor = editor.getEditorState().read(
      () =>
        $getRoot()
          .getChildren()
          .find((node) => node.getType() === "paragraph")!
          .getKey(),
      { editor },
    );

    expect(
      executeAction(editor, govbbFormEditor, "question_OPENING_HOURS", { targetKey: anchor })
        .executed,
    ).toBe(true);

    const openingKey = editor.getEditorState().read(
      () =>
        $getRoot()
          .getChildren()
          .find((node) => field(node, "opening-hours"))!
          .getKey(),
      { editor },
    );

    expect(
      executeAction(editor, govbbFormEditor, "question_CHECKBOX_ACCORDION", {
        targetKey: openingKey,
      }).executed,
    ).toBe(true);

    let key = "",
      groups: NonNullable<ChoiceConfig["groups"]> = [],
      options: QuestionOption[] = [];

    editor.update(
      () => {
        const accordion = $getRoot()
          .getChildren()
          .find((node) => field(node, "checkbox-accordion"))!;

        const native = $native(accordion),
          defaults = groupedChoices($settings(accordion));

        key = native.question!.key;
        expect(key).toBe("checkbox-accordion");
        expect(native.options?.map((option) => option.id)).toEqual(
          defaults.flatMap((group) => group.options.map((option) => option.id)),
        );
        groups = defaults.map((group) => ({
          id: group.id,
          label: group.label,
          optionIds: group.options.map((option) => option.id),
        }));
        expect(native.question!.config).toMatchObject({ groups });
        options = structuredClone(native.options!);
        expect(groups.map((group) => group.optionIds)).toEqual(
          defaults.map((group) => group.options.map((option) => option.id)),
        );
        groups[0]!.label = "Activities";
        groups[0]!.higherRisk = true;
        options[0]!.label = [{ text: "Advice", marks: ["bold"] }];
        options[0]!.value = "approved";
        $setFormSettings(accordion, {
          nativeGroups: groups,
          nativeOptions: options,
          hasMinChoices: true,
          minChoices: 1,
          isDisabled: true,
        });
      },
      { discrete: true },
    );

    const source = codec.encode(editor.getEditorState().toJSON()),
      loaded = codec.prepare(source);

    expect(loaded.source).toBe(source);
    const form = serializedToNativeForm(loaded.state, govbbFormEditor);
    expect(
      form.blocks.find((block) => block.type === "question" && block.key === key),
    ).toMatchObject({
      kind: "choice",
      key,
      options,
      config: { selection: "multiple", presentation: "accordion", groups },
      disabled: true,
      validation: [expect.objectContaining({ type: "minSelections", value: 1 })],
    });
    expect(
      form.blocks.find((block) => block.type === "question" && block.kind === "opening-hours"),
    ).toMatchObject({ key: "opening-hours" });
  } finally {
    editor.dispose();
  }
});
