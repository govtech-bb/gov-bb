import type { TimePrimitive } from "@govtech-bb/form-types";

export const GenericTime: TimePrimitive = {
  fieldId: "generic-time",
  htmlType: "time",
  label: "Time",
  validations: {
    required: {
      value: true,
      error: "This field is required",
    },
  },
};
