import type { CheckboxPrimitive } from "@govtech-bb/form-types";

export const RawCheckbox: CheckboxPrimitive = {
  fieldId: "raw-checkbox",
  htmlType: "checkbox",
  label: "Checkbox",
  options: [],
  validations: {
    required: {
      value: true,
      error: "This field is required",
    },
  },
};
