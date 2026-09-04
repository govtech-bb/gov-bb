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
    min: {
      value: 0,
      error: "This field must be greater than or equal to 0",
    },
  },
};
