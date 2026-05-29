import type { SelectPrimitive } from "@govtech-bb/form-types";

export const RawSelect: SelectPrimitive = {
  fieldId: "raw-select",
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
