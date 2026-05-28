import type { DatePrimitive } from "@govtech-bb/form-types";

export const RawDate: DatePrimitive = {
  fieldId: "raw-date",
  htmlType: "date",
  label: "Date",
  validations: {
    required: {
      value: true,
      error: "This field is required",
    },
  },
};
