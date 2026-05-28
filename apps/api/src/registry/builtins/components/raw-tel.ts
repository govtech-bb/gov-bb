import type { TelPrimitive } from "@govtech-bb/form-types";

export const RawTel: TelPrimitive = {
  fieldId: "raw-tel",
  htmlType: "tel",
  label: "Telephone",
  validations: {
    required: {
      value: true,
      error: "This field is required",
    },
  },
};
