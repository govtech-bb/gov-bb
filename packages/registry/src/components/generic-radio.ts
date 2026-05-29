import type { RadioPrimitive } from "@govtech-bb/form-types";

export const GenericRadio: RadioPrimitive = {
  fieldId: "generic-radio",
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
