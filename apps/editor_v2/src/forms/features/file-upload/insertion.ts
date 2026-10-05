import { $createDecoratorField } from "../../editor/field-nodes";
import type { FieldInsertion } from "../../editor/field-module";
import { fileUploadField } from "./definition";

export const fileUploadInsertion: FieldInsertion = {
  id: "FILE_UPLOAD",
  order: 8,
  keywords: "document",
  create: () => [$createDecoratorField("file-upload", fileUploadField.defaults)],
  question: {
    description:
      "People attach a document, such as proof of address. Only ask for files the service needs, never ‘just in case’.",
    label: "Proof of address",
    hint: "A recent utility bill or bank statement",
  },
  answer: {
    description:
      "A file upload with no question label. Use it under an existing label: every GovBB field needs a visible label.",
    hint: "A recent utility bill or bank statement",
  },
};

export const fileUploadEntry = {
  id: fileUploadInsertion.id,
  title: fileUploadField.label,
  icon: fileUploadField.icon,
  kind: fileUploadField.kind,
  keywords: fileUploadInsertion.keywords,
  create: fileUploadInsertion.create,
  description: fileUploadInsertion.answer.description,
  sample: { hint: fileUploadInsertion.answer.hint },
};
