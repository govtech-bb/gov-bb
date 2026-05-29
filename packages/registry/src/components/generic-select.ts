import type { SelectPrimitive } from "@govtech-bb/form-types";

export const GenericSelect: SelectPrimitive = {
  fieldId: "generic-select",
  htmlType: "select",
  label: "Select",
  options: [],
  multiple: false,
  validations: {
    required: {
      value: true,
      error: "This field is required",
    },
  },
};
