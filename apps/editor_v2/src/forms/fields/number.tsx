import { nativeField } from "../native";
import { createElement } from "react";
import { Hash } from "@phosphor-icons/react";
import { defineField } from "../field";
import type { Settings } from "../model/settings";
import { widthIssues } from "./field-setting-checks";
import { positiveIncrementError } from "./field-increments";
import { $createDrawnInput } from "../canvas/field-nodes";
import { setDOMUnmanaged } from "lexical";
import caretUp from "@phosphor-icons/core/assets/fill/caret-up-fill.svg?raw";
import caretDown from "@phosphor-icons/core/assets/fill/caret-down-fill.svg?raw";
import { $static, icon } from "@/editor/react";
import { govbbBox } from "../../ui/govbb";
import { fieldModule, type FieldInsertion } from "../canvas/field-module";
import { NumberControls } from "./number-controls";
import { ruleLimit } from "../settings/define-setting";
import { configSetting } from "../settings/shared-settings";

export type NumberSettings = { required: boolean };

export const readNumberSettings = (raw: Settings): NumberSettings => ({ required: !!raw.required });

/** The smallest and largest number allowed, and how far the up and down arrows step it, in the native config. */
const numberSettings = [
  ruleLimit("hasMinNumber", "minNumber", "minimum"),
  ruleLimit("hasMaxNumber", "maxNumber", "maximum"),
  configSetting("step", { number: true }),
];

export const numberField = defineField({
  native: nativeField("number", { kind: "number", valueType: "number" }),
  kind: "number",
  label: "Number",
  untitled: "Unlabelled number",
  icon: createElement(Hash),
  gutterOffset: 11,
  source: { storage: { type: "input", property: "kind", value: "number", defaultValue: "text" } },
  settings: { read: readNumberSettings, defaults: { required: true }, own: numberSettings },
  capabilities: {
    hideLabel: true,
    repeat: true,
    width: "long",
    formula: true,
    comparisons: [
      "EQUAL",
      "NOT_EQUAL",
      "GREATER_THAN",
      "LESS_THAN",
      "GREATER_OR_EQUAL_THAN",
      "LESS_OR_EQUAL_THAN",
      "IS_EMPTY",
      "IS_NOT_EMPTY",
    ],
  },
  draw: $drawNumber,
  validate: (_settings, raw, where) => {
    const error = positiveIncrementError(raw.step);

    return [
      ...widthIssues(raw, where),
      ...(error ? [{ code: "field-step", message: error, where }] : []),
    ];
  },
});

export const numberInsertion: FieldInsertion = {
  id: "INPUT_NUMBER",
  order: 5,
  create: () => [$createDrawnInput("number", numberField.defaults)],
  question: {
    description:
      "People enter a quantity, such as a number of copies, and can step it up or down. For ID numbers or years, use Text input.",
    label: "Number of copies",
    hint: "Between 1 and 10",
  },
  answer: {
    description:
      "A number input with no question label. Use it under an existing label: every GovBB field needs a visible label.",
    hint: "Between 1 and 10",
  },
};

export const numberEntry = {
  id: numberInsertion.id,
  title: numberField.label,
  icon: numberField.icon,
  kind: numberField.kind,
  keywords: numberInsertion.keywords,
  create: numberInsertion.create,
  description: numberInsertion.answer.description,
  sample: { hint: numberInsertion.answer.hint },
};

export function $drawNumber() {
  const box = $static(
    "div",
    `relative flex h-(--form-control) w-full cursor-default items-center justify-end gap-2 pl-3 max-w-44 ${govbbBox}`,
    { "data-drawn": "" },
  );

  setDOMUnmanaged(box, { captureSelection: true });

  const stepper = $static(
    "span",
    "flex w-10 shrink-0 flex-col self-stretch border-l-2 border-ink bg-grey-10 [&>span]:flex [&>span]:flex-1 [&>span]:items-center [&>span]:justify-center",
  );

  stepper.innerHTML = `<span>${icon(caretUp, 12)}</span><span class="border-t-2 border-ink">${icon(caretDown, 12)}</span>`;
  box.append(stepper);

  return box;
}

export const NumberModule = () =>
  fieldModule({
    field: numberField,
    insertion: numberInsertion,
    Controls: NumberControls,
  });
