import type { TelPrimitive } from "@govtech-bb/form-types";

export const WorkTelephone: TelPrimitive = {
  fieldId: "work-telephone",
  label: "Work telephone",
  htmlType: "tel",
  hint: "For example, 421-1234 for Barbados or +1 876 123 4567 for numbers outside Barbados",
  validations: {
    phone: {
      value: true,
      error: "Please enter a valid phone number",
    },
  },
};
