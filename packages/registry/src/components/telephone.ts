import type { TelPrimitive } from "@govtech-bb/form-types";

export const Telephone: TelPrimitive = {
  fieldId: "telephone",
  label: "Telephone number",
  htmlType: "tel",
  validations: {
    required: {
      value: true,
      error: "Telephone number is required",
    },
    phone: {
      value: true,
      error: "Please enter a valid phone number",
    },
  },
};
