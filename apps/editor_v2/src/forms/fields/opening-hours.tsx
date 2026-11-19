import { nativeField } from "../native";
import { createElement } from "react";
import { Clock } from "@phosphor-icons/react";
import { defineField } from "../field";
import type { Settings } from "../model/settings";
import { patternWorks } from "../model/field-settings";
import { nonRepeatableIssues } from "./field-setting-checks";
import { openingHoursDefaults } from "./opening-hours-defaults";
import { $createDecoratorField } from "../canvas/field-nodes";
import { fieldModule, type FieldInsertion } from "../canvas/field-module";
import { OpeningHoursControls } from "./opening-hours-controls";
import { OpeningHours } from "./opening-hours-presentation";
import { answerPattern } from "./field-rule-settings";

export type OpeningHoursSettings = { required: boolean; pattern?: string };

export const readOpeningHoursSettings = (raw: Settings): OpeningHoursSettings => ({
  required: !!raw.required,
  pattern: typeof raw.pattern === "string" ? raw.pattern : undefined,
});

export const openingHoursField = defineField({
  native: nativeField("opening-hours", { kind: "opening-hours", valueType: "string[]" }),
  kind: "opening-hours",
  label: "Opening hours",
  untitled: "Unlabelled opening hours",
  icon: createElement(Clock),
  gutterOffset: 0,
  source: {
    storage: {
      type: "widget",
      property: "widget",
      value: "opening-hours",
      defaultValue: "page-break",
    },
  },
  settings: {
    read: readOpeningHoursSettings,
    defaults: openingHoursDefaults,
    own: [answerPattern],
  },
  capabilities: {
    hideLabel: true,
    repeat: false,
    formula: true,
    mention: true,
    multiple: true,
    comparisons: ["IS_EMPTY", "IS_NOT_EMPTY"],
  },
  validate: (settings, raw, where) => [
    ...nonRepeatableIssues(raw, where),
    ...(settings.pattern !== undefined && !patternWorks(settings.pattern)
      ? [{ code: "pattern", message: "This format’s pattern doesn’t work", where }]
      : []),
  ],
});

export const openingHoursInsertion: FieldInsertion = {
  id: "OPENING_HOURS",
  order: 12,
  keywords: "weekly, business, hours",
  create: () => [$createDecoratorField("opening-hours", openingHoursField.defaults)],
  question: {
    description: "People enter opening and closing times for each day of the week.",
    label: "Opening hours",
  },
  answer: { description: "Weekly opening hours under an existing question label." },
};

export const openingHoursEntry = {
  id: openingHoursInsertion.id,
  title: openingHoursField.label,
  icon: openingHoursField.icon,
  kind: openingHoursField.kind,
  keywords: openingHoursInsertion.keywords,
  create: openingHoursInsertion.create,
  description: openingHoursInsertion.answer.description,
  sample: {},
};

export const OpeningHoursModule = () =>
  fieldModule({
    field: openingHoursField,
    insertion: openingHoursInsertion,
    Controls: OpeningHoursControls,
    Preview: OpeningHours,
    Renderer: OpeningHours,
  });
