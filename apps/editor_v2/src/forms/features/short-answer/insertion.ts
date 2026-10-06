import { $createDrawnInput } from "../../editor/field-nodes";
import type { FieldInsertion } from "../../editor/field-module";
import { shortAnswerField } from "./definition";

export const shortAnswerInsertion: FieldInsertion = {
  id: "INPUT_TEXT",
  order: 0,
  keywords: "first name, last name, short answer",
  create: () => [$createDrawnInput("text", shortAnswerField.defaults)],
  question: {
    description:
      "People type a short answer on one line, such as a name or reference number. Use Textarea for longer answers.",
    label: "National Identification (ID) number",
    hint: "For example, 900314-0052",
  },
  answer: {
    description:
      "A text input with no question label. Use it under an existing label: every GovBB field needs a visible label.",
    hint: "For example, 900314-0052",
  },
};

export const shortAnswerEntry = {
  id: shortAnswerInsertion.id,
  title: shortAnswerField.label,
  icon: shortAnswerField.icon,
  kind: shortAnswerField.kind,
  keywords: shortAnswerInsertion.keywords,
  create: shortAnswerInsertion.create,
  description: shortAnswerInsertion.answer.description,
  sample: { hint: shortAnswerInsertion.answer.hint },
};
