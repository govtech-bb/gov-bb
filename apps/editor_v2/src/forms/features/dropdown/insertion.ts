import { $createChoiceInput } from "../../editor/field-nodes";
import type { FieldInsertion } from "../../editor/field-module";
import { dropdownField } from "./definition";

export const dropdownInsertion: FieldInsertion = {
  id: "DROPDOWN",
  order: 4,
  keywords: "dropdown",
  create: () => $createChoiceInput("dropdown", dropdownField.defaults),
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

export const dropdownEntry = {
  id: dropdownInsertion.id,
  title: dropdownField.label,
  icon: dropdownField.icon,
  kind: dropdownField.kind,
  keywords: dropdownInsertion.keywords,
  create: dropdownInsertion.create,
  description: dropdownInsertion.answer.description,
  sample: { hint: dropdownInsertion.answer.hint, options: dropdownInsertion.answer.options },
};
