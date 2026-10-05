import { nativeField } from "../../native";
import { createElement } from "react";
import { ListChecks } from "@phosphor-icons/react";
import { defineField } from "../../field";
import type { Settings } from "../../core/settings";

import { nonRepeatableIssues } from "../shared/settings";

import { copyGroups, groupedChoices, type GroupDraft } from "./groups";

export type CheckboxAccordionSettings = { required: boolean; groups: GroupDraft[] };

export const readCheckboxAccordionSettings = (raw: Settings): CheckboxAccordionSettings => ({
  required: !!raw.required,
  groups: groupedChoices(raw),
});

export const checkboxAccordionField = defineField({
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
  settings: { read: readCheckboxAccordionSettings, defaults: { required: true } },
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
