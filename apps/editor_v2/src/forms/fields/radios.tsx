import { $static } from "@/editor/react";
import { $createChoiceInput } from "../canvas/field-nodes";
import { nativeField } from "../native";
import { createElement } from "react";
import { RadioButton } from "@phosphor-icons/react";
import { defineField } from "../field";
import type { Settings } from "../model/settings";
import { govbbMarkerLabel, govbbRadio } from "../../ui/govbb";
import { choicePresentation } from "./choice-options";
import { fieldModule, type FieldInsertion } from "../canvas/field-module";
import { RadiosControls } from "./radios-controls";

export type RadiosSettings = { required: boolean };

export const readRadiosSettings = (raw: Settings): RadiosSettings => ({
  required: !!raw.required,
});

export const radiosField = defineField({
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
  settings: { read: readRadiosSettings, defaults: { required: true } },
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
    textClass: govbbMarkerLabel,
    optionalClass: govbbMarkerLabel,
    marker: () => $static("span", govbbRadio),
  }),
  turnInto: { group: "choice", order: 0, create: () => $createChoiceInput("multiple-choice")[0]! },
});

export const radiosInsertion: FieldInsertion = {
  id: "MULTIPLE_CHOICE",
  order: 2,
  keywords: "radio, multiple choice",
  create: () => $createChoiceInput("multiple-choice", radiosField.defaults),
  question: {
    description:
      "People choose one option from a list of radio buttons, such as Yes or No. Use radios when people can select only one option.",
    label: "Who is the birth certificate for?",
    options: ["Myself", "My child", "Someone else"],
  },
  answer: {
    description:
      "Radio buttons with no question label. Use them under an existing label: every GovBB field needs a visible label.",
    options: ["Myself", "My child", "Someone else"],
  },
};

export const radiosEntry = {
  id: radiosInsertion.id,
  title: radiosField.label,
  icon: radiosField.icon,
  kind: radiosField.kind,
  keywords: radiosInsertion.keywords,
  create: radiosInsertion.create,
  description: radiosInsertion.answer.description,
  sample: {
    hint: radiosInsertion.answer.hint,
    options: radiosInsertion.answer.options,
  },
};

export const RadiosModule = () =>
  fieldModule({
    field: radiosField,
    insertion: radiosInsertion,
    Controls: RadiosControls,
  });
