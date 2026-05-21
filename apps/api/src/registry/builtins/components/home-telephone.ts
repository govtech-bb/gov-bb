import { TelPrimitive } from "@govtech-bb/form-types";

export const HomeTelephone: TelPrimitive = {
  fieldId: "home-telephone",
  htmlType: "tel",
  label: "Home telephone",
  validations: {
    pattern: {
      value: "^\\d{3}[- ]?\\d{4}$|^(?:\\d{1,2}[- ]?)?\\d{3}[- ]?\\d{3}[- ]?\\d{4}$",
      error: "Please enter a valid phone number",
    },
  },
};
