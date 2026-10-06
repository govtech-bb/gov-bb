import { $createDrawnInput } from "../../editor/field-nodes";
import type { FieldInsertion } from "../../editor/field-module";
import { dateField } from "./definition";

export const dateInsertion: FieldInsertion = {
  id: "INPUT_DATE",
  order: 9,
  create: () => [$createDrawnInput("date", dateField.defaults)],
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

export const dateEntry = {
  id: dateInsertion.id,
  title: dateField.label,
  icon: dateField.icon,
  kind: dateField.kind,
  keywords: dateInsertion.keywords,
  create: dateInsertion.create,
  description: dateInsertion.answer.description,
  sample: { hint: dateInsertion.answer.hint },
};
