import { $createLongAnswerInput, LongAnswerNode } from "../canvas/field-nodes";
import { nativeField } from "../native";
import { createElement } from "react";
import { TextAlignLeft } from "@phosphor-icons/react";
import { defineField } from "../field";
import { widthIssues } from "./field-setting-checks";
import type { Settings } from "../model/settings";
import { setDOMUnmanaged } from "lexical";
import { $static } from "@/editor/react";
import { govbbBox, govbbFieldWidth } from "../../ui/govbb";
import { fieldModule, type FieldInsertion } from "../canvas/field-module";
import { TextareaControls } from "./textarea-controls";
import { characterLimits } from "./field-rule-settings";

export type TextareaSettings = { required: boolean; width?: string };

export const readTextareaSettings = (raw: Settings): TextareaSettings => ({
  required: !!raw.required,
  width: typeof raw.width === "string" ? raw.width : undefined,
});

export const textareaField = defineField({
  native: nativeField("long-answer", { kind: "long-text", valueType: "string" }),
  kind: "long-answer",
  label: "Textarea",
  untitled: "Unlabelled textarea",
  icon: createElement(TextAlignLeft),
  gutterOffset: 10,
  source: { storage: { type: "long-answer" } },
  settings: { read: readTextareaSettings, defaults: { required: true }, own: characterLimits },
  capabilities: {
    hideLabel: true,
    repeat: true,
    width: "long",
    formula: true,
    comparisons: [
      "IS",
      "IS_NOT",
      "CONTAINS",
      "DOES_NOT_CONTAIN",
      "STARTS_WITH",
      "DOES_NOT_START_WITH",
      "ENDS_WITH",
      "DOES_NOT_END_WITH",
      "IS_EMPTY",
      "IS_NOT_EMPTY",
    ],
  },
  turnInto: { group: "written-answer", order: 1, create: () => $createLongAnswerInput() },
  draw: $drawTextarea,
  validate: (_settings, raw, where) => widthIssues(raw, where),
});

export const textareaInsertion: FieldInsertion = {
  id: "TEXTAREA",
  order: 1,
  keywords: "long answer, multiline",
  create: () => [$createLongAnswerInput(textareaField.defaults)],
  question: {
    description:
      "People type a longer answer in a bigger box, such as a reason or a description. Use hint text to say what to include.",
    label: "Why do you need a fee waiver?",
    hint: "Tell us about any change in your income",
  },
  answer: {
    description:
      "A textarea with no question label. Use it under an existing label: every GovBB field needs a visible label.",
    hint: "Tell us about any change in your income",
  },
};

export const textareaEntry = {
  id: textareaInsertion.id,
  title: textareaField.label,
  icon: textareaField.icon,
  kind: textareaField.kind,
  keywords: textareaInsertion.keywords,
  create: textareaInsertion.create,
  description: textareaInsertion.answer.description,
  sample: { hint: textareaInsertion.answer.hint },
};

export function $drawTextarea() {
  const box = $static(
    "div",
    `relative flex min-h-26 w-full cursor-default p-3 ${govbbFieldWidth} ${govbbBox}`,
    { "data-drawn": "" },
  );

  setDOMUnmanaged(box, { captureSelection: true });

  return box;
}

export const TextareaModule = () => ({
  ...fieldModule({
    field: textareaField,
    insertion: textareaInsertion,
    Controls: TextareaControls,
  }),
  nodes: [{ type: "long-answer", node: LongAnswerNode }],
});
