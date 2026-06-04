import type { TextPrimitive } from "@govtech-bb/form-types";

export const NationalIdNumber: TextPrimitive = {
  fieldId: "national-id-number",
  label: "National ID number",
  htmlType: "text",
  ui: {
    width: "short",
  },
  // Hard mask: 9 = digit, literal `-` auto-inserted. Limits input to ten
  // digits in the National ID shape (e.g. 850101-0001), blocking overflow
  // typing/paste and non-numeric characters. Mirrors the `pattern` below.
  mask: "999999-9999",
  validations: {
    pattern: {
      value: "^\\d{6}-\\d{4}$",
      error: "Enter a valid ID number (for example, 850101-0001)",
    },
  },
};
