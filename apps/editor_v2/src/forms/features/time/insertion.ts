import { $createDrawnInput } from "../../editor/field-nodes";
import type { FieldInsertion } from "../../editor/field-module";
import { timeField } from "./definition";

export const timeInsertion: FieldInsertion = {
  id: "INPUT_TIME",
  order: 10,
  create: () => [$createDrawnInput("time", timeField.defaults)],
  question: {
    description:
      "People enter a time of day, such as when an event starts. If you need the date too, add a Date question.",
    label: "Start time",
    hint: "For example, 4:30pm",
  },
  answer: {
    description:
      "A time input with no question label. Use it under an existing label: every GovBB field needs a visible label.",
    hint: "For example, 4:30pm",
  },
};

export const timeEntry = {
  id: timeInsertion.id,
  title: timeField.label,
  icon: timeField.icon,
  kind: timeField.kind,
  keywords: timeInsertion.keywords,
  create: timeInsertion.create,
  description: timeInsertion.answer.description,
  sample: { hint: timeInsertion.answer.hint },
};
