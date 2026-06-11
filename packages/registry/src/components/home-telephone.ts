import { TelPrimitive } from "@govtech-bb/form-types";

export const HomeTelephone: TelPrimitive = {
  fieldId: "home-telephone",
  htmlType: "tel",
  label: "Home telephone",
  validations: {
    phone: {
      value: true,
      error: "Please enter a valid phone number",
    },
  },
};
