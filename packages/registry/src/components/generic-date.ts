import type { DatePrimitive } from "@govtech-bb/form-types";

export const GenericDateInput: DatePrimitive = {
  fieldId: "generic-date",
  htmlType: "date",
  label: "Date",
  validations: {
    required: {
      value: true,
      error: "This field is required",
    },
  },
};
