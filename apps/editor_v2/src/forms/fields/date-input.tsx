import { CalendarBlank } from "@phosphor-icons/react";
import { setDOMUnmanaged } from "lexical";
import { createElement } from "react";
import { $static, el, container } from "@/editor/react";
import { cn } from "../../cn";
import { govbbBox } from "../../ui/govbb";
import type { Settings } from "../model/settings";
import { $optional, $logicMount, answerGap } from "../canvas/answer-dom";
import { CanvasDrawing, fieldModule, type FieldInsertion } from "../canvas/field-module";
import { $createDrawnInput } from "../canvas/field-nodes";
import { defineField } from "../field";
import { nativeField } from "../native";
import { DateInputControls } from "./date-input-controls";
import { ageLimits, dateLimits } from "./date-limits";

// The Date input: the day, month and year people type in three boxes

export type DateInputSettings = { required: boolean };

export const readDateInputSettings = (raw: Settings): DateInputSettings => ({
  required: !!raw.required,
});

/** GovBB's date input: Day, Month and Year, each a labelled box. */
export function $dateInputParts() {
  const parts = $static("div", "flex w-fit cursor-default items-end gap-4", { "data-date": "" });
  setDOMUnmanaged(parts, { captureSelection: true });

  for (const [name, width] of [
    ["Day", "w-18"],
    ["Month", "w-18"],
    ["Year", "w-28"],
  ] as const) {
    const part = el("div", "flex flex-col gap-1");
    const label = el("span", "leading-[1.5] font-bold");
    label.textContent = name;
    part.append(label, el("div", cn("h-(--form-control)", width, govbbBox)));
    parts.append(part);
  }

  return parts;
}

function $dateInputDOM() {
  const dom = el("div", `${container} ${answerGap}`);
  const parts = $dateInputParts();

  parts.append($optional("mb-3.5 self-end"));
  dom.append($logicMount(), parts, el("div", "sr-only", { "data-text": "" }));

  return dom;
}

export const dateInputField = defineField({
  native: nativeField("date", { kind: "date", valueType: "date" }),
  kind: "date",
  label: "Date input",
  untitled: "Unlabelled date input",
  icon: createElement(CalendarBlank),
  gutterOffset: 0,
  source: {
    storage: { type: "input", property: "kind", value: "date", defaultValue: "text" },
    attributes: { relativeDate: "string" },
  },
  settings: {
    read: readDateInputSettings,
    defaults: { required: true },
    own: [...ageLimits, dateLimits],
  },
  capabilities: {
    hideLabel: true,
    repeat: false,
    formula: true,
    comparisons: ["IS", "IS_NOT", "IS_BEFORE", "IS_AFTER", "IS_EMPTY", "IS_NOT_EMPTY"],
  },
  createDOM: $dateInputDOM,
});

export const dateInputInsertion: FieldInsertion = {
  id: "INPUT_DATE",
  order: 9,
  create: () => [$createDrawnInput("date", dateInputField.defaults)],
  question: {
    description:
      "People type the day, month and year in three boxes. Best for dates they know, like a date of birth; give an example in the hint.",
    label: "Date of birth",
    hint: "For example, 27 3 1990",
  },
  answer: {
    description:
      "Day, month and year boxes with no question label. Use them under an existing label: every GovBB field needs a visible label.",
    hint: "For example, 27 3 1990",
  },
};

export const DateInputModule = () =>
  fieldModule({
    field: dateInputField,
    insertion: dateInputInsertion,
    Controls: DateInputControls,
    Preview: () => <CanvasDrawing draw={$dateInputParts} />,
  });
