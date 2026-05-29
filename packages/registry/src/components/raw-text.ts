import type { TextPrimitive } from "@govtech-bb/form-types";

export const RawText: TextPrimitive = {
  fieldId: "raw-text",
  htmlType: "text",
  label: "Text",
  validations: {
    required: {
      value: true,
      error: "This field is required",
    },
  },
};
