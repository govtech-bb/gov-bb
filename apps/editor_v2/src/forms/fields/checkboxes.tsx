import { $static } from "@/editor/react";
import { $createChoiceInput } from "../canvas/field-nodes";
import { nativeField } from "../native";
import { createElement } from "react";
import { CheckSquare } from "@phosphor-icons/react";
import { defineField } from "../field";
import type { Settings } from "../model/settings";
import { govbbCheckbox, govbbMarkerLabel } from "../../ui/govbb";
import { choicePresentation } from "./choice-options";
import { fieldModule, type FieldInsertion } from "../canvas/field-module";
import { CheckboxesControls } from "./checkboxes-controls";
import { choiceLimits } from "./field-rule-settings";

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
  settings: { read: readCheckboxesSettings, defaults: { required: true }, own: choiceLimits },
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
    textClass: govbbMarkerLabel,
    optionalClass: govbbMarkerLabel,
    marker: () => $static("span", govbbCheckbox),
  }),
  turnInto: { group: "choice", order: 1, create: () => $createChoiceInput("checkboxes")[0]! },
});

export const checkboxesInsertion: FieldInsertion = {
  id: "CHECKBOXES",
  order: 3,
  keywords: "declaration, confirm",
  create: () => $createChoiceInput("checkboxes", checkboxesField.defaults),
  question: {
    description:
      "People tick every option that applies; add hint text ‘Select all that apply’. One checkbox on its own makes a declaration.",
    label: "Where will you work as a hairdresser?",
    hint: "Select all that apply",
    options: ["At a salon", "From home", "At clients’ homes"],
  },
  answer: {
    description:
      "Checkboxes with no question label. Use them under an existing label: every GovBB field needs a visible label.",
    hint: "Select all that apply",
    options: ["At a salon", "From home", "At clients’ homes"],
  },
};

export const checkboxesEntry = {
  id: checkboxesInsertion.id,
  title: checkboxesField.label,
  icon: checkboxesField.icon,
  kind: checkboxesField.kind,
  keywords: checkboxesInsertion.keywords,
  create: checkboxesInsertion.create,
  description: checkboxesInsertion.answer.description,
  sample: { hint: checkboxesInsertion.answer.hint, options: checkboxesInsertion.answer.options },
};

export const CheckboxesModule = () =>
  fieldModule({
    field: checkboxesField,
    insertion: checkboxesInsertion,
    Controls: CheckboxesControls,
  });
