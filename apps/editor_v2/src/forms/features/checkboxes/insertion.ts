import { $createChoiceInput } from "../../editor/field-nodes";
import type { FieldInsertion } from "../../editor/field-module";
import { checkboxesField } from "./definition";

export const checkboxesInsertion: FieldInsertion = {
  id: "CHECKBOXES",
  order: 3,
  keywords: "declaration, confirm",
  create: () => $createChoiceInput("checkboxes", checkboxesField.defaults),
  question: {
    description:
      "People tick every option that applies; add hint text ‘Select all that apply’. One checkbox on its own makes a declaration.",
    label: "Where will you work as a hairdresser?",
    hint: "Select all that apply",
    options: ["At a salon", "From home", "At clients’ homes"],
  },
  answer: {
    description:
      "Checkboxes with no question label. Use them under an existing label: every GovBB field needs a visible label.",
    hint: "Select all that apply",
    options: ["At a salon", "From home", "At clients’ homes"],
  },
};

export const checkboxesEntry = {
  id: checkboxesInsertion.id,
  title: checkboxesField.label,
  icon: checkboxesField.icon,
  kind: checkboxesField.kind,
  keywords: checkboxesInsertion.keywords,
  create: checkboxesInsertion.create,
  description: checkboxesInsertion.answer.description,
  sample: { hint: checkboxesInsertion.answer.hint, options: checkboxesInsertion.answer.options },
};
