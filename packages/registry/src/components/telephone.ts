import type { TelPrimitive } from "@govtech-bb/form-types";

export const Telephone: TelPrimitive = {
  fieldId: "telephone",
  label: "Telephone number",
  htmlType: "tel",
  hint: "For example, 421-1234 for Barbados or +1 876 123 4567 for numbers outside Barbados",
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
