import type { TextPrimitive } from "@govtech-bb/form-types";

export const GenericText: TextPrimitive = {
  fieldId: "generic-text",
  htmlType: "text",
  label: "Text",
  validations: {
    required: {
      value: true,
      error: "This field is required",
    },
  },
};
