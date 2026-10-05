import { $static } from "../../../editor/react/block-dom";
import { $createChoiceInput } from "../../editor/field-nodes";
import { nativeField } from "../../native";
import { createElement } from "react";
import { CheckSquare } from "@phosphor-icons/react";
import { defineField } from "../../field";

import type { Settings } from "../../core/settings";

import { choicePresentation, markerPad } from "../choices/presentation";

export type CheckboxesSettings = { required: boolean };

export const readCheckboxesSettings = (raw: Settings): CheckboxesSettings => ({
  required: !!raw.required,
});

export const checkboxesField = defineField({
  native: nativeField("checkboxes", {
    kind: "choice",
    valueType: "string[]",
    config: { selection: "multiple", presentation: "checkboxes" },
  }),
  kind: "checkboxes",
  label: "Checkboxes",
  untitled: "Unlabelled checkboxes",
  icon: createElement(CheckSquare),
  gutterOffset: 3,
  source: {
    choice: true,
    storage: { type: "option", property: "kind", value: "checkboxes", defaultValue: "checkboxes" },
  },
  settings: { read: readCheckboxesSettings, defaults: { required: true } },
  capabilities: {
    hideLabel: true,
    repeat: false,
    formula: true,
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
  choice: choicePresentation({
    kind: "checkboxes",
    multiple: true,
    classes: {
      dom: "pb-2",
      card: "relative flex max-w-full cursor-text items-start gap-4",
      add: "pt-3",
    },
    rowClass: "items-start gap-4",
    textClass: markerPad,
    optionalClass: markerPad,
    marker: () =>
      $static("span", "size-(--form-marker) shrink-0 border-2 border-ink bg-white rounded-none"),
  }),
  turnInto: { group: "choice", order: 1, create: () => $createChoiceInput("checkboxes")[0]! },
});
