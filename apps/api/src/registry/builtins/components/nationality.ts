import { SelectPrimitive } from "@govtech-bb/form-types";

export const Nationality: SelectPrimitive = {
  fieldId: "nationality",
  htmlType: "select",
  label: "Nationality / Citizenship",
  options: [],
  multiple: false,
  validations: {
    required: {
      value: true,
      error: "Nationality is required",
    },
  },
};
