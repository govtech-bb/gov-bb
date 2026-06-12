import { TelPrimitive } from "@govtech-bb/form-types";

export const HomeTelephone: TelPrimitive = {
  fieldId: "home-telephone",
  htmlType: "tel",
  label: "Home telephone",
  hint: "For example, 421-1234 for Barbados or +1 876 123 4567 for numbers outside Barbados",
  validations: {
    phone: {
      value: true,
      error: "Please enter a valid phone number",
    },
  },
};
