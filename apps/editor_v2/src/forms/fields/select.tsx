import { $static, icon } from "@/editor/react";
import { $createChoiceInput } from "../canvas/field-nodes";
import { nativeField } from "../native";
import { createElement } from "react";
import { CaretCircleDown } from "@phosphor-icons/react";
import { defineField } from "../field";
import type { Settings } from "../model/settings";
import { widthIssues } from "./field-setting-checks";
import { govbbSelect, govbbSelectCaret } from "../../ui/govbb";
import { choicePresentation } from "./choice-options";
import caretDown from "@phosphor-icons/core/assets/fill/caret-down-fill.svg?raw";
import { fieldModule, type FieldInsertion } from "../canvas/field-module";
import { SelectControls } from "./select-controls";

export type SelectSettings = { required: boolean };

export const readSelectSettings = (raw: Settings): SelectSettings => ({
  required: !!raw.required,
});

export const selectField = defineField({
  native: nativeField("dropdown", {
    kind: "choice",
    valueType: "string",
    config: { selection: "single", presentation: "dropdown" },
  }),
  kind: "dropdown",
  label: "Select",
  untitled: "Unlabelled select",
  icon: createElement(CaretCircleDown),
  gutterOffset: 5,
  source: {
    choice: true,
    storage: { type: "option", property: "kind", value: "dropdown", defaultValue: "checkboxes" },
  },
  settings: { read: readSelectSettings, defaults: { required: true } },
  capabilities: {
    hideLabel: true,
    repeat: false,
    width: "long",
    formula: true,
    comparisons: ["IS", "IS_NOT", "IS_EMPTY", "IS_NOT_EMPTY", "IS_ANY_OF", "IS_NOT_ANY_OF"],
  },
  choice: choicePresentation({
    kind: "dropdown",
    multiple: false,
    classes: {
      dom: "border-y-0",
      card: "relative flex max-w-120 cursor-text items-center border-l-4 border-line pl-5",
      add: "border-l-4 border-line pt-1 pb-1.5 pl-5",
    },
    rowClass: "items-center py-1.5",
    optionalClass: "mr-3",
    leading: (index) => {
      if (index !== 0) return null;

      const select = $static("div", `mb-2 ${govbbSelect}`, { "data-select": "" });

      select.innerHTML = `<span class="flex-1"></span><span class="${govbbSelectCaret}">${icon(caretDown, 14)}</span>`;

      return select;
    },
  }),
  turnInto: { group: "choice", order: 2, create: () => $createChoiceInput("dropdown")[0]! },
  validate: (_settings, raw, where) => widthIssues(raw, where),
});

export const selectInsertion: FieldInsertion = {
  id: "DROPDOWN",
  order: 4,
  keywords: "dropdown",
  create: () => $createChoiceInput("dropdown", selectField.defaults),
  question: {
    description:
      "People open a list and choose one option. Use Select for long lists only when radios or a smaller list are unsuitable.",
    label: "Parish",
    hint: "Where you currently live",
    options: ["Christ Church", "Saint Andrew", "Saint George"],
  },
  answer: {
    description:
      "A select with no question label. Use it under an existing label: every GovBB field needs a visible label.",
    hint: "Where you currently live",
    options: ["Christ Church", "Saint Andrew", "Saint George"],
  },
};

export const selectEntry = {
  id: selectInsertion.id,
  title: selectField.label,
  icon: selectField.icon,
  kind: selectField.kind,
  keywords: selectInsertion.keywords,
  create: selectInsertion.create,
  description: selectInsertion.answer.description,
  sample: { hint: selectInsertion.answer.hint, options: selectInsertion.answer.options },
};

export const SelectModule = () =>
  fieldModule({
    field: selectField,
    insertion: selectInsertion,
    Controls: SelectControls,
  });
