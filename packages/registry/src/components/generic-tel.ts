import type { TelPrimitive } from "@govtech-bb/form-types";

export const GenericTel: TelPrimitive = {
  fieldId: "generic-tel",
  htmlType: "tel",
  label: "Telephone",
  validations: {
    required: {
      value: true,
      error: "This field is required",
    },
  },
};
