import { $dateDOM } from "./presentation";
import { nativeField } from "../../native";
import { createElement } from "react";
import { CalendarBlank } from "@phosphor-icons/react";
import { defineField } from "../../field";
import type { Settings } from "../../core/settings";

export type DateSettings = { required: boolean };

export const readDateSettings = (raw: Settings): DateSettings => ({ required: !!raw.required });

export const dateField = defineField({
  native: nativeField("date", { kind: "date", valueType: "date" }),
  kind: "date",
  label: "Date input",
  untitled: "Unlabelled date input",
  icon: createElement(CalendarBlank),
  gutterOffset: 0,
  source: { storage: { type: "input", property: "kind", value: "date", defaultValue: "text" } },
  settings: { read: readDateSettings, defaults: { required: true } },
  capabilities: {
    hideLabel: true,
    repeat: false,
    formula: true,
    comparisons: ["IS", "IS_NOT", "IS_BEFORE", "IS_AFTER", "IS_EMPTY", "IS_NOT_EMPTY"],
  },
  createDOM: $dateDOM,
});
