import type { EmailPrimitive } from "@govtech-bb/form-types";

export const GenericEmail: EmailPrimitive = {
  fieldId: "generic-email",
  htmlType: "email",
  label: "Email",
  validations: {
    required: {
      value: true,
      error: "This field is required",
    },
    email: {
      value: true,
      error: "Please enter a valid email address",
    },
  },
};
