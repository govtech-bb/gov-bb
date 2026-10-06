import { nativeField } from "../../native";
import { createElement } from "react";
import { Clock } from "@phosphor-icons/react";
import { defineField } from "../../field";
import type { Settings } from "../../core/settings";

import { patternWorks } from "../../core/field-settings";
import { nonRepeatableIssues } from "../shared/settings";
import { openingHoursDefaults } from "./defaults";

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
  settings: { read: readOpeningHoursSettings, defaults: openingHoursDefaults },
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
