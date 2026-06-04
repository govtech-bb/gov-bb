import { TextPrimitive } from "@govtech-bb/form-types";

export const Town: TextPrimitive = {
  fieldId: "town",
  htmlType: "text",
  label: "City / Town",
  validations: {
    minLength: {
      value: 2,
      error: "City / Town must be at least 2 characters",
    },
  },
};
