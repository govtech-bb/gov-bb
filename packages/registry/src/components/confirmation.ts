import { CheckboxPrimitive } from "@govtech-bb/form-types";

export const Confirmation: CheckboxPrimitive = {
  fieldId: "confirmation",
  htmlType: "checkbox",
  label: "I confirm...",
  options: [{ label: "I confirm", value: "confirmed" }],
  validations: {
    required: {
      value: true,
      error: "You must confirm the declaration to continue",
    },
  },
};
