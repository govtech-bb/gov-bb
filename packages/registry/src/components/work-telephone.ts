import type { TelPrimitive } from "@govtech-bb/form-types";

export const WorkTelephone: TelPrimitive = {
  fieldId: "work-telephone",
  label: "Work telephone",
  htmlType: "tel",
  validations: {
    phone: {
      value: true,
      error: "Please enter a valid phone number",
    },
  },
};
