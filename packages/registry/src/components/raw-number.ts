import type { NumberPrimitive } from "@govtech-bb/form-types";

export const RawNumber: NumberPrimitive = {
  fieldId: "raw-number",
  htmlType: "number",
  label: "Number",
  validations: {
    required: {
      value: true,
      error: "This field is required",
    },
  },
};
