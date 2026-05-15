import { TextPrimitive } from "@govtech-bb/form-types";

export const Address: TextPrimitive = {
  fieldId: "address",
  htmlType: "text",
  label: "Address",
  validations: {
    required: {
      value: true,
      error: "Address is required",
    },
    minLength: {
      value: 5,
      error: "Address must be at least 5 characters",
    },
  },
};
