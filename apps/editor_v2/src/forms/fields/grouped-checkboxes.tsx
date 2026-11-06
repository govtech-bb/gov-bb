import { nativeField } from "../native";
import { createElement } from "react";
import { ListChecks } from "@phosphor-icons/react";
import { defineField } from "../field";
import type { Settings } from "../model/settings";
import { nonRepeatableIssues } from "./field-setting-checks";
import { copyGroups, groupedChoices, type GroupDraft, newGroup } from "./grouped-checkboxes-groups";
import { $createDecoratorField } from "../canvas/field-nodes";
import { fieldModule, type FieldInsertion } from "../canvas/field-module";
import { GroupedCheckboxesControls } from "./grouped-checkboxes-controls";
import { GroupedChoices, GroupedCheckboxesPreview } from "./grouped-checkboxes-presentation";
import { choiceLimits } from "./field-rule-settings";

export type GroupedCheckboxesSettings = { required: boolean; groups: GroupDraft[] };

export const readGroupedCheckboxesSettings = (raw: Settings): GroupedCheckboxesSettings => ({
  required: !!raw.required,
  groups: groupedChoices(raw),
});

export const groupedCheckboxesField = defineField({
  native: nativeField("checkbox-accordion", {
    kind: "choice",
    valueType: "string[]",
    config: { selection: "multiple", presentation: "accordion" },
  }),
  kind: "checkbox-accordion",
  label: "Grouped checkboxes",
  untitled: "Unlabelled grouped checkboxes",
  icon: createElement(ListChecks),
  gutterOffset: 0,
  source: {
    referencesOptions: true,
    storage: {
      type: "widget",
      property: "widget",
      value: "checkbox-accordion",
      defaultValue: "page-break",
    },
  },
  settings: {
    read: readGroupedCheckboxesSettings,
    defaults: { required: true },
    own: choiceLimits,
  },
  capabilities: {
    hideLabel: true,
    repeat: false,
    formula: true,
    mention: true,
    multiple: true,
    comparisons: [
      "CONTAINS",
      "DOES_NOT_CONTAIN",
      "IS_EMPTY",
      "IS_NOT_EMPTY",
      "IS_ANY_OF",
      "IS_NOT_ANY_OF",
      "IS_EVERY_OF",
    ],
  },
  validate: (_settings, raw, where) => nonRepeatableIssues(raw, where),
  options: (settings) => settings.groups.flatMap((group) => group.options),
  ownedIds: (settings) =>
    settings.groups.flatMap((group) => [group.id, ...group.options.map((option) => option.id)]),
  copySettings: (settings) => ({ groups: copyGroups(settings.groups) }),
});

export const groupedCheckboxesInsertion: FieldInsertion = {
  id: "CHECKBOX_ACCORDION",
  order: 13,
  keywords: "categories, grouped choices, checkbox accordion",
  create: () => [
    $createDecoratorField("checkbox-accordion", {
      ...groupedCheckboxesField.defaults,
      groups: [newGroup()],
    }),
  ],
  question: {
    description:
      "People select options grouped into named categories. Categories can be marked for case review.",
    label: "Services offered",
    options: ["Advice", "Training"],
  },
  answer: {
    description: "Grouped checkboxes under an existing question label.",
    options: ["Advice", "Training"],
  },
};

export const groupedCheckboxesEntry = {
  id: groupedCheckboxesInsertion.id,
  title: groupedCheckboxesField.label,
  icon: groupedCheckboxesField.icon,
  kind: groupedCheckboxesField.kind,
  keywords: groupedCheckboxesInsertion.keywords,
  create: groupedCheckboxesInsertion.create,
  description: groupedCheckboxesInsertion.answer.description,
  sample: { options: groupedCheckboxesInsertion.answer.options },
};

export const GroupedCheckboxesModule = () =>
  fieldModule({
    field: groupedCheckboxesField,
    insertion: groupedCheckboxesInsertion,
    Controls: GroupedCheckboxesControls,
    Preview: GroupedCheckboxesPreview,
    Renderer: GroupedChoices,
  });
