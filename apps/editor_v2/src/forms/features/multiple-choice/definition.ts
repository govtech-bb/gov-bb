import { $static } from "../../../editor/react/block-dom";
import { $createChoiceInput } from "../../editor/field-nodes";
import { nativeField } from "../../native";
import { createElement } from "react";
import { RadioButton } from "@phosphor-icons/react";
import { defineField } from "../../field";

import type { Settings } from "../../core/settings";

import { choicePresentation, markerPad } from "../choices/presentation";

export type MultipleChoiceSettings = { required: boolean };

export const readMultipleChoiceSettings = (raw: Settings): MultipleChoiceSettings => ({
  required: !!raw.required,
});

export const multipleChoiceField = defineField({
  native: nativeField("multiple-choice", {
    kind: "choice",
    valueType: "string",
    config: { selection: "single", presentation: "radio" },
  }),
  kind: "multiple-choice",
  label: "Radios",
  untitled: "Unlabelled radios",
  icon: createElement(RadioButton),
  gutterOffset: 3,
  source: {
    choice: true,
    storage: {
      type: "option",
      property: "kind",
      value: "multiple-choice",
      defaultValue: "checkboxes",
    },
  },
  settings: { read: readMultipleChoiceSettings, defaults: { required: true } },
  capabilities: {
    hideLabel: true,
    repeat: false,
    formula: true,
    comparisons: ["IS", "IS_NOT", "IS_EMPTY", "IS_NOT_EMPTY", "IS_ANY_OF", "IS_NOT_ANY_OF"],
  },
  choice: choicePresentation({
    kind: "multiple-choice",
    multiple: false,
    classes: {
      dom: "pb-2",
      card: "relative flex max-w-full cursor-text items-start gap-4",
      add: "pt-3",
    },
    rowClass: "items-start gap-4",
    textClass: markerPad,
    optionalClass: markerPad,
    marker: () =>
      $static("span", "size-(--form-marker) shrink-0 border-2 border-ink bg-white rounded-full"),
  }),
  turnInto: { group: "choice", order: 0, create: () => $createChoiceInput("multiple-choice")[0]! },
});
