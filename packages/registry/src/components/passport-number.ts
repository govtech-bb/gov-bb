import type { TextPrimitive } from "@govtech-bb/form-types";

export const PassportNumber: TextPrimitive = {
  fieldId: "passport-number",
  label: "Passport number",
  htmlType: "text",
  ui: {
    width: "short",
  },
  validations: {
    minLength: {
      value: 6,
      error: "Passport number must be at least 6 characters",
    },
  },
};
