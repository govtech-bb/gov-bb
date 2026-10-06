import { $createLongAnswerInput } from "../../editor/field-nodes";
import type { FieldInsertion } from "../../editor/field-module";
import { longAnswerField } from "./definition";

export const longAnswerInsertion: FieldInsertion = {
  id: "TEXTAREA",
  order: 1,
  keywords: "long answer, multiline",
  create: () => [$createLongAnswerInput(longAnswerField.defaults)],
  question: {
    description:
      "People type a longer answer in a bigger box, such as a reason or a description. Use hint text to say what to include.",
    label: "Why do you need a fee waiver?",
    hint: "Tell us about any change in your income",
  },
  answer: {
    description:
      "A textarea with no question label. Use it under an existing label: every GovBB field needs a visible label.",
    hint: "Tell us about any change in your income",
  },
};

export const longAnswerEntry = {
  id: longAnswerInsertion.id,
  title: longAnswerField.label,
  icon: longAnswerField.icon,
  kind: longAnswerField.kind,
  keywords: longAnswerInsertion.keywords,
  create: longAnswerInsertion.create,
  description: longAnswerInsertion.answer.description,
  sample: { hint: longAnswerInsertion.answer.hint },
};
