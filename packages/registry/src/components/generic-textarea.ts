import type { TextAreaPrimitive } from "@govtech-bb/form-types";

export const GenericTextarea: TextAreaPrimitive = {
  fieldId: "generic-textarea",
  htmlType: "textarea",
  label: "Long text",
  validations: {
    required: {
      value: true,
      error: "This field is required",
    },
  },
};
