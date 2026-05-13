import { EmailPrimitive } from "@govtech-bb/form-types";

export const EmailAddress: EmailPrimitive = {
  fieldId: "email",
  htmlType: "email",
  label: "Email address",
  validations: {
    required: {
      value: true,
      error: "Email address is required",
    },
    email: {
      value: true,
      error: "Please enter a valid email address",
    },
  },
};
