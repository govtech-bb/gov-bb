import { $createDecoratorField } from "../../editor/field-nodes";
import type { FieldInsertion } from "../../editor/field-module";
import { openingHoursField } from "./definition";

export const openingHoursInsertion: FieldInsertion = {
  id: "OPENING_HOURS",
  order: 12,
  keywords: "weekly, business, hours",
  create: () => [$createDecoratorField("opening-hours", openingHoursField.defaults)],
  question: {
    description: "People enter opening and closing times for each day of the week.",
    label: "Opening hours",
  },
  answer: { description: "Weekly opening hours under an existing question label." },
};

export const openingHoursEntry = {
  id: openingHoursInsertion.id,
  title: openingHoursField.label,
  icon: openingHoursField.icon,
  kind: openingHoursField.kind,
  keywords: openingHoursInsertion.keywords,
  create: openingHoursInsertion.create,
  description: openingHoursInsertion.answer.description,
  sample: {},
};
