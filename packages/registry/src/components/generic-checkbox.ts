import type { CheckboxPrimitive } from "@govtech-bb/form-types";

export const GenericCheckbox: CheckboxPrimitive = {
  fieldId: "generic-checkbox",
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
