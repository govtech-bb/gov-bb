import { $createChoiceInput } from "../../editor/field-nodes";
import type { FieldInsertion } from "../../editor/field-module";
import { multipleChoiceField } from "./definition";

export const multipleChoiceInsertion: FieldInsertion = {
  id: "MULTIPLE_CHOICE",
  order: 2,
  keywords: "radio, multiple choice",
  create: () => $createChoiceInput("multiple-choice", multipleChoiceField.defaults),
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

export const multipleChoiceEntry = {
  id: multipleChoiceInsertion.id,
  title: multipleChoiceField.label,
  icon: multipleChoiceField.icon,
  kind: multipleChoiceField.kind,
  keywords: multipleChoiceInsertion.keywords,
  create: multipleChoiceInsertion.create,
  description: multipleChoiceInsertion.answer.description,
  sample: {
    hint: multipleChoiceInsertion.answer.hint,
    options: multipleChoiceInsertion.answer.options,
  },
};
