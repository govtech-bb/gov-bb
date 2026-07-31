import type { TimePrimitive } from "@govtech-bb/form-types";

export const GenericTime: TimePrimitive = {
  fieldId: "generic-time",
  htmlType: "time",
  label: "Time",
  // Default to 30-minute increments in the native time picker. A value typed
  // off the step is still accepted, and a recipe can override `step` (seconds)
  // for a different increment.
  step: 1800,
  ui: {
    width: "short",
  },
  validations: {
    required: {
      value: true,
      error: "This field is required",
    },
  },
};
