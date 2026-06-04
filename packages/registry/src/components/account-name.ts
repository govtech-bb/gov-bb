import { TextPrimitive } from "@govtech-bb/form-types";

export const AccountName: TextPrimitive = {
  fieldId: "account-name",
  label: "Account name",
  htmlType: "text",
  validations: {
    minLength: {
      value: 5,
      error: "Account name must be at least 5 characters",
    },
  },
};
