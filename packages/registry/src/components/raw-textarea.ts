import type { TextAreaPrimitive } from "@govtech-bb/form-types";

export const RawTextarea: TextAreaPrimitive = {
  fieldId: "raw-textarea",
  htmlType: "textarea",
  label: "Long text",
  validations: {
    required: {
      value: true,
      error: "This field is required",
    },
  },
};
