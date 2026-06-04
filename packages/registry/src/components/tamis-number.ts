import type { TextPrimitive } from "@govtech-bb/form-types";

export const TamisNumber: TextPrimitive = {
  fieldId: "tamis-number",
  label: "TAMIS number",
  htmlType: "text",
  validations: {
    pattern: {
      value: "^\\d*$",
      error: "TAMIS number must contain only digits",
    },
    minLength: {
      value: 10,
      error: "TAMIS number must be at least 10 digits",
    },
    maxLength: {
      value: 15,
      error: "TAMIS number must be 15 digits or fewer",
    },
  },
};
