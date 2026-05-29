import type { NumberPrimitive } from "@govtech-bb/form-types";

export const GenericNumber: NumberPrimitive = {
  fieldId: "generic-number",
  htmlType: "number",
  label: "Number",
  validations: {
    required: {
      value: true,
      error: "This field is required",
    },
  },
};
