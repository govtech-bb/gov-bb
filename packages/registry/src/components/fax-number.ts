import type { TelPrimitive } from "@govtech-bb/form-types";

export const FaxNumber: TelPrimitive = {
  fieldId: "fax-number",
  label: "Fax number",
  htmlType: "tel",
  validations: {
    phone: {
      value: true,
      error: "Please enter a valid fax number",
    },
  },
};
