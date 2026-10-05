import { $createDrawnInput } from "../../editor/field-nodes";
import type { FieldInsertion } from "../../editor/field-module";
import { emailField } from "./definition";

export const emailInsertion: FieldInsertion = {
  id: "INPUT_EMAIL",
  order: 6,
  create: () => [$createDrawnInput("email", emailField.defaults)],
  question: {
    description:
      "People type an email address, which is checked for the right format. Ask for it once: GovBB doesn’t make people type it twice.",
    label: "Email address",
  },
  answer: {
    description:
      "An email address input with no question label. Use it under an existing label: every GovBB field needs a visible label.",
  },
};

export const emailEntry = {
  id: emailInsertion.id,
  title: emailField.label,
  icon: emailField.icon,
  kind: emailField.kind,
  keywords: emailInsertion.keywords,
  create: emailInsertion.create,
  description: emailInsertion.answer.description,
  sample: { hint: emailInsertion.answer.hint },
};
