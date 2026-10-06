import { $createDecoratorField } from "../../editor/field-nodes";
import type { FieldInsertion } from "../../editor/field-module";
import { checkboxAccordionField } from "./definition";
import { newGroup } from "./groups";

export const checkboxAccordionInsertion: FieldInsertion = {
  id: "CHECKBOX_ACCORDION",
  order: 13,
  keywords: "categories, grouped choices, checkbox accordion",
  create: () => [
    $createDecoratorField("checkbox-accordion", {
      ...checkboxAccordionField.defaults,
      groups: [newGroup()],
    }),
  ],
  question: {
    description:
      "People select options grouped into named categories. Categories can be marked for case review.",
    label: "Services offered",
    options: ["Advice", "Training"],
  },
  answer: {
    description: "Grouped checkboxes under an existing question label.",
    options: ["Advice", "Training"],
  },
};

export const checkboxAccordionEntry = {
  id: checkboxAccordionInsertion.id,
  title: checkboxAccordionField.label,
  icon: checkboxAccordionField.icon,
  kind: checkboxAccordionField.kind,
  keywords: checkboxAccordionInsertion.keywords,
  create: checkboxAccordionInsertion.create,
  description: checkboxAccordionInsertion.answer.description,
  sample: { options: checkboxAccordionInsertion.answer.options },
};
