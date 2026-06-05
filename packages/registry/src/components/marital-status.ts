import type { SelectPrimitive } from "@govtech-bb/form-types";

export const MaritalStatus: SelectPrimitive = {
  fieldId: "marital-status",
  label: "Marital status",
  htmlType: "select",
  options: [
    { label: "Single", value: "single" },
    { label: "Married", value: "married" },
    { label: "Divorced", value: "divorced" },
  ],
  multiple: false,
  validations: {
    required: {
      value: true,
      error: "Marital status is required",
    },
  },
};
