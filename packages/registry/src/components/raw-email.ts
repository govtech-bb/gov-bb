import type { EmailPrimitive } from "@govtech-bb/form-types";

export const RawEmail: EmailPrimitive = {
  fieldId: "raw-email",
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
