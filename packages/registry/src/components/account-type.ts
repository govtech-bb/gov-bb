import type { SelectPrimitive } from "@govtech-bb/form-types";

export const AccountType: SelectPrimitive = {
  fieldId: "account-type",
  label: "Account type",
  htmlType: "select",
  options: [
    { label: "Checking", value: "checking" },
    { label: "Savings", value: "savings" },
    { label: "Business", value: "business" },
    { label: "Joint", value: "joint" },
  ],
  multiple: false,
  validations: {
    required: {
      value: true,
      error: "Account type is required",
    },
  },
};
