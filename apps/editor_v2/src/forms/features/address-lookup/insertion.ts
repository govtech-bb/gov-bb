import { $createDrawnInput } from "../../editor/field-nodes";
import type { FieldInsertion } from "../../editor/field-module";
import { addressLookupField } from "./definition";

export const addressLookupInsertion: FieldInsertion = {
  id: "ADDRESS_LOOKUP",
  order: 11,
  keywords: "address, search",
  create: () => [$createDrawnInput("address-lookup", addressLookupField.defaults)],
  question: {
    description: "People search for an address and submit one text answer.",
    label: "Address",
  },
  answer: { description: "An address search box under an existing question label." },
};

export const addressLookupEntry = {
  id: addressLookupInsertion.id,
  title: addressLookupField.label,
  icon: addressLookupField.icon,
  kind: addressLookupField.kind,
  keywords: addressLookupInsertion.keywords,
  create: addressLookupInsertion.create,
  description: addressLookupInsertion.answer.description,
};
