import type { TelPrimitive } from "@govtech-bb/form-types";

export const MobileTelephone: TelPrimitive = {
  fieldId: "mobile-telephone",
  label: "Mobile telephone",
  htmlType: "tel",
  validations: {
    phone: {
      value: true,
      error: "Please enter a valid phone number",
    },
  },
};
