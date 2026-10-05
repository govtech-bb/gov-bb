import type { TelPrimitive } from "@govtech-bb/form-types";

export const GenericTel: TelPrimitive = {
  fieldId: "generic-tel",
  htmlType: "tel",
  label: "Telephone number",
  hint: "For example, 421-1234 for a Barbados number or +1 876 210 1234 for a number outside Barbados.",
  validations: {
    required: {
      value: true,
      error: "Enter a telephone number",
    },
    phone: {
      value: true,
      error: "Please enter a valid phone number",
    },
  },
};
