import type { RadioPrimitive } from "@govtech-bb/form-types";

export const RawRadio: RadioPrimitive = {
  fieldId: "raw-radio",
  htmlType: "radio",
  label: "Radio",
  options: [],
  validations: {
    required: {
      value: true,
      error: "This field is required",
    },
  },
};
