import type { TextPrimitive } from "@govtech-bb/form-types";

export const NationalInsuranceNumber: TextPrimitive = {
  fieldId: "national-insurance-number",
  label: "National Insurance number",
  htmlType: "text",
  ui: {
    width: "short",
  },
  // Hard mask: 9 = digit. Limits input to exactly six digits, blocking
  // overflow typing/paste and non-numeric characters. Mirrors the `pattern`
  // below.
  mask: "999999",
  validations: {
    pattern: {
      value: "^\\d{6}$",
      error:
        "Enter a valid National Insurance number (6 digits, for example, 123456)",
    },
  },
};
