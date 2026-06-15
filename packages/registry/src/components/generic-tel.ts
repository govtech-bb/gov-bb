import type { TelPrimitive } from "@govtech-bb/form-types";

export const GenericTel: TelPrimitive = {
  fieldId: "generic-tel",
  htmlType: "tel",
  label: "Telephone",
  hint: "For example, 421-1234 for Barbados or +1 876 123 4567 for numbers outside Barbados",
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
