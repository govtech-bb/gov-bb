import { $createDrawnInput } from "../../editor/field-nodes";
import type { FieldInsertion } from "../../editor/field-module";
import { phoneField } from "./definition";

export const phoneInsertion: FieldInsertion = {
  id: "INPUT_PHONE_NUMBER",
  order: 7,
  keywords: "telephone",
  create: () => [$createDrawnInput("phone", phoneField.defaults)],
  question: {
    description:
      "People type a phone number in any format. Barbados numbers need no country code; numbers from abroad start with +.",
    label: "Telephone number",
    hint: "For example, 246 123 4567",
  },
  answer: {
    description:
      "A phone number input with no question label. Use it under an existing label: every GovBB field needs a visible label.",
    hint: "For example, 246 123 4567",
  },
};

export const phoneEntry = {
  id: phoneInsertion.id,
  title: phoneField.label,
  icon: phoneField.icon,
  kind: phoneField.kind,
  keywords: phoneInsertion.keywords,
  create: phoneInsertion.create,
  description: phoneInsertion.answer.description,
  sample: { hint: phoneInsertion.answer.hint },
};
