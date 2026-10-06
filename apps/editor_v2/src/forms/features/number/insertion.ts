import { $createDrawnInput } from "../../editor/field-nodes";
import type { FieldInsertion } from "../../editor/field-module";
import { numberField } from "./definition";

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
