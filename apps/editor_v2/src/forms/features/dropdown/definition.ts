import { $static } from "../../../editor/react/block-dom";
import { $createChoiceInput } from "../../editor/field-nodes";
import { nativeField } from "../../native";
import { createElement } from "react";
import { CaretCircleDown } from "@phosphor-icons/react";
import { defineField } from "../../field";

import type { Settings } from "../../core/settings";

import { widthIssues } from "../shared/settings";

import { choicePresentation } from "../choices/presentation";
import { icon } from "../../../editor/react/block-dom";
import caretDown from "@phosphor-icons/core/assets/fill/caret-down-fill.svg?raw";

export type DropdownSettings = { required: boolean };

export const readDropdownSettings = (raw: Settings): DropdownSettings => ({
  required: !!raw.required,
});

export const dropdownField = defineField({
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
  settings: { read: readDropdownSettings, defaults: { required: true } },
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

      const select = $static(
        "div",
        "mb-2 flex h-(--form-control) max-w-[var(--field-width,30rem)] items-stretch rounded-sm border-2 border-ink bg-white",
        { "data-select": "" },
      );

      select.innerHTML = `<span class="flex-1"></span><span class="flex w-12 items-center justify-center border-l-2 border-ink bg-grey-10">${icon(caretDown, 14)}</span>`;

      return select;
    },
  }),
  turnInto: { group: "choice", order: 2, create: () => $createChoiceInput("dropdown")[0]! },
  validate: (_settings, raw, where) => widthIssues(raw, where),
});
