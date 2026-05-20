import type { DatePrimitive } from "@govtech-bb/form-types";

export const DateOfBirth: DatePrimitive = {
  fieldId: "date-of-birth",
  htmlType: "date",
  label: "Date of birth",
  validations: {
    past: {
      value: true,
      error: "Date of birth must be in the past",
    },
  },
};
